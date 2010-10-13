/* Copyright 2010 Palm, Inc. All rights reserved. */
/*global Mojo:false, Observable, CacheManager, OperationQueue */

/**
 * Provides a paging and caching implementation for data models who pull from remote data sources.
 */
var DataModelBase = Class.create(Observable, {
    initialize: function($super, options) {
        $super();

        this.options = Object.extend({
            lookahead: 20,
            initialPageSize: 20,
            cacheSaveDelay: 5000,
        }, options);

        this.cacheManager = new CacheManager(this.options.cacheName, this.options.cacheTimeout);
        this.refreshQueue = new OperationQueue();
        (this.refreshQueue.getSuccessHandler())();    // We want to start out in an open state

        this.cache = [];
        this.headPending = [];
        this.tailPending = [];
        this.requestUpperBound = 0;
        this.blockedRequests = [];
        this.initialPageSize = this.options.initialPageSize;
        this.requestCount = 0;
        this.pendingRequests = {};

        this.sequenceId = 0;
    },

    observeLength: function(fn) {
        Mojo.requireFunction(fn, "DataModelBase.observeLength: 'fn' parameter must be a function.");
        this.lengthObservable = this.lengthObservable || new Observable();
        this.lengthObservable.observe(fn);
    },
    stopObservingLength: function(fn) {
        if (this.lengthObservable) {
            this.lengthObservable.stopObserving(fn);
        }
    },

    /**
     * Primary interface of the model.
     * 
     * Note that the success callback may be called multiple times over the same range of offset+limit,
     * if a cache exists for the given model. Calls to this callback may also be broken into multiple
     * calls over the range [offset, offset+limit] based on data availability.
     * 
     * @param offset Offset to load in the general model.
     * @param limit Maximum number of elements to load.
     * @param onSuccess Success callback. Function with parameters (offset, limit, items)
     * @param onFailure Failure callback. Function with parameters (response)
     */
    getRange: function(offset, limit, onSuccess, onFailure) {
        if (offset < 0) {
            onFailure({ resopnseText: "Invalid offset: " + offset });
            return;
        }

        this.refreshQueue.queue({
                onSuccess: this.getRangeWorker.bind(this, offset, limit, onSuccess, onFailure),
                onFailure: onFailure
            });
    },

    /**
     * Throws out the cache and reloads the first page of data.
     * 
     * Note that this call will block all other data retrieval calls.
     * 
     * @param onSuccess Success callback. Function with parameters (results)
     * @param onFailure Failure callback. Function with parameters (response)
     */
    refresh: function(onSuccess, onFailure) {
        // We are requesting a larger buffer than our caller requested to reduce the number of request
        // to the slower datasource and to determine if we have loaded the complete dataset.
        var readLimit = this.initialPageSize + this.options.lookahead;

        if (!this.refreshQueue.complete) {
            // Just queue and quit
            Mojo.Log.info("Refresh of %s in process, queueing", this.getCacheName());
            this.refreshQueue.queue({
                    onSuccess: onSuccess,
                    onFailure: onFailure
                });
            return;
        }

        this.cancelWorker();
        this.refreshQueue.reset();
        this.remoteLoaded = false;
        this.savedCache = false;
        this.complete = false;

        try {
            Mojo.Log.info("Refresh %s from remote. readLimit %d", this.getCacheName(), readLimit);
            this.loadRangeWorker(
                    0, readLimit,
                    this.refreshSuccessHandler.bind(this, this.initialPageSize, readLimit, this.refreshQueue.getSuccessHandler(onSuccess)),
                    this.refreshQueue.getFailureHandler(onFailure));
        } catch (err) {
            Mojo.Log.error("Refresh request failed: %s: %s", err);
            (this.refreshQueue.getFailureHandler())(err);
            throw err;
        }
    },

    /**
     * Cancels all pending requests.
     */
    cancel: function() {
        Mojo.Log.info("Cancel %s sequence: %d", this.getCacheName(), this.sequenceId);
        // Cleanup our internal structures.
        this.cancelWorker();

        // Notify any pending operations that they are done
        var len = this.blockedRequests.length;
        for (var i = 0; i < len; i++) {
            var request = this.blockedRequests[i];
            request.onFailure && request.onFailure(request.offset, request.limit);
        }
        this.blockedRequests = [];
    },
    cancelWorker: function() {
        // Cancel all of the requests that are currently pending.
        for (var i in this.pendingRequests) {
            if (this.pendingRequests.hasOwnProperty(i)) {
                var x = this.pendingRequests[i];
                x && x.cancel && x.cancel();
                delete this.pendingRequests[i];
            }
        }
        this.sequenceId++;

        this.refreshQueue.getSuccessHandler()();
    },

    /**
     * Returns the number of elements that are known to exist at this point. If complete
     * this is also the total number of elements.
     */
    getKnownSize: function() {
        return this.headPending.length + this.cache.length + this.tailPending.length;
    },

    /**
     * Returns true if all elements have been loaded.
     */
    isComplete: function() {
        return !!this.complete;
    },

    /*
     * Methods to be implemented by child subclasses
     */

    /**
     * Callback method used provide a unique name for this model in the local cache.
     * Subclasses must implement this method.
     * @protected
     */
    getCacheName: function() {
        throw new Error("getCacheName: Not impl");
    },

    /**
     * Callback method used to load the data for this model from the remote store.
     * Subclasses must implement this method.
     * @protected
     */
    loadRange: function(offset, limit, onSuccess, onFailure) {
        throw new Error("loadRange: Not impl");
    },

    /**
     * Returns true if the given data set should mark the dataset complete.
     * The default implementation says that complete occurs when we do not
     * have limit elements read, but subclasses may override this for
     * more temperamental data sources.
     */
    setComplete: function(results, readLimit, resultOffset, responseLen) {
        return (responseLen || results.length) < readLimit;
    },

    notifyUpdatedItem: function(index) {
        this.notifyObservers({
            model: this,
            updatedItem: index
        });
    },

    addPending: function(item, tail) {
        if (tail) {
            this.tailPending.push(item);
        } else {
            this.headPending.unshift(item);
        }
        this.notifyLengthObservers();
    },
    pendingIndex: function(item, tail) {
        var list = tail ? this.tailPending : this.headPending,
            len = list.length;
        for (var i = 0; i < len; i++) {
            if (this.pendingMatch(item, list[i])) {
                return i;
            }
        }
    },
    removePending: function(item, tail) {
        var list = tail ? this.tailPending : this.headPending,
            i = this.pendingIndex(item, tail);
        if (i !== undefined) {
            list.splice(i, 1);
            this.notifyLengthObservers();
            return i;
        }
    },
    pendingMatch: function(newItem, pendingItem) {
        return newItem === pendingItem;
    },

    requestCleaner: function(requestId, callback) {
        var self = this;
        return function() {
            if (self.pendingRequests[requestId]) {
                delete self.pendingRequests[requestId];
            }
            return callback && callback.apply(this, arguments);
        };
    },

    /**
     * Method called by the refresh handler to enable limited diffing on
     * the new and old datasets.
     */
    getChangedElements: function(newList, oldList) {
        // NOP Under the default implementation
    },

    /*
     * Internal methods.
     */
    getRangeWorker: function(offset, limit, onSuccess, onFailure) {
        var rangeData = this.extractRange(offset, limit);
        if (this.complete || rangeData.available.length) {            // In memory cache is available, nice and easy now
            onSuccess.curry(offset, rangeData.available.length, rangeData.available).defer();
        }
        if (this.complete) {
            return;
        }

        if (rangeData.remainingLimit) {
            this.blockedRequests.push({
                offset: rangeData.remainingOffset, limit: rangeData.remainingLimit,
                onSuccess: onSuccess, onFailure: onFailure
            });
            Mojo.Log.info("Pushed blocking queue: %j", this.blockedRequests[this.blockedRequests.length-1]);
        }

        // IF we are not getting anywhere near the end of the cache, do not send another request
        // TODO : Also make sure that we request more data if we stray into the tail pending zone
        if (offset+limit+this.options.lookahead <= this.requestUpperBound) {
            return;
        }

        Mojo.Log.info("offsets: offset: %d remainingOffset: %d requestUpperBound: %d", offset, rangeData.remainingOffset, this.requestUpperBound);
        Mojo.Log.info("limit: limit: %d remainingLimit: %d", limit, rangeData.remainingLimit);

        // Make more requests for anything that is not currently available.
        if (!this.isComplete()) {
            var readOffset = this.requestUpperBound,
                readLimit = limit,
                cacheName = this.getCacheName();
            if (rangeData.remainingOffset > readOffset) {
                readLimit = rangeData.remainingOffset+limit-readOffset;
            } else if (readOffset + readLimit <= readOffset) {
                // If the request does not go past our current window, only read ahead by
                // the lookahead size
                readLimit = 0;
            }

            // We are requesting a larger buffer than our caller requested to reduce the number of request
            // to the slower datasource and to determine if we have loaded the complete dataset.
            readLimit = readLimit + this.options.lookahead;

            // Start a cache load if we have not already
            Mojo.Log.info("Check cache: %s %d", cacheName, offset);
            if (!offset && cacheName) {
                this.cacheManager.load(cacheName, this.loadCacheSuccessHandler.bind(this));
            }

            Mojo.Log.info("Request %s from remote. Offset: %d limit: %d readOffset: %d readLimit %d known: %d", this.getCacheName(), offset, limit, readOffset, readLimit, this.getKnownSize());
            this.requestUpperBound = readOffset + readLimit;
            this.loadRangeWorker(
                    readOffset, readLimit,
                    this.loadRangeSuccessHandler.bind(this, this.sequenceId, readOffset, readLimit, this.headPending.length),
                    this.loadRangeFailureHandler.bind(this, this.sequenceId, readOffset, readLimit));
        }
    },
    loadRangeWorker: function(offset, limit, successHandler, failureHandler) {
        var requestId = this.requestCount++,
            request = this.loadRange(offset, limit, this.requestCleaner(requestId, successHandler), this.requestCleaner(requestId, failureHandler));
        if (request) {
            this.pendingRequests[requestId] = request;
        }
    },
    loadCacheSuccessHandler: function(results) {
        if (this.remoteLoaded) {
            // Data already loaded
            Mojo.Log.info("Ignoring load cache. Already loaded from remote.");
            return;
        }

        results = this.fromCacheDB(results);
        Mojo.Log.info("Load cache: %o", results && results.length);

        if (!results) {
            // Cache not found
            return;
        }

        this.initialPageSize = Math.max(this.initialPageSize, results.length);
        this.cache = results;

        this.notifyPendingRequests();
        this.notifyLengthObservers();
    },

    loadRangeSuccessHandler: function(sequenceId, readOffset, readLimit, headOffset, results, resultOffset, responseLen) {
        Mojo.Log.info("Load range success: this.sequenceId: %d sequenceId: %d", this.sequenceId, sequenceId);
        if (sequenceId !== this.sequenceId) {
            Mojo.Log.info("Ignoring remote %s response due to invalid sequence sequnceId: %d readLimit: %d  known: %d results: %d resultOffset: %d responseLen: %d", this.getCacheName(), sequenceId, readLimit, this.getKnownSize(), results.length, resultOffset, responseLen);
            return;
        }

        var cacheName = this.getCacheName();

        // Force results to be an array, to work arround the {} bug
        if (!results.length) {
            results = [];
        }

        resultOffset = resultOffset || 0;

        if (!this.remoteLoaded) {
            this.cache = [];
        }

        this.remoteLoaded = true;
        this.complete = this.setComplete(results, readLimit, resultOffset, responseLen);

        Mojo.Log.info("Loaded %s from remote. readLimit: %d  known: %d results: %d resultOffset: %d responseLen: %d", this.getCacheName(), readLimit, this.getKnownSize(), results.length, resultOffset, responseLen);

        // Load the new data into the memory cache
        var spliceArgs = $A(results);
        spliceArgs.unshift(readOffset+resultOffset, results.length);
        this.cache.splice.apply(this.cache, spliceArgs);

        // TODO : Check to see if this is the same data a the cache. If so, do not notify (If possible)
        if (!this.savedCache && !readOffset && (!responseLen || this.cache.length === responseLen) && cacheName) {
            // First load, store off the cache data
            this.initialPageSize = readLimit;
            this.savedCache = true;
            var self = this;
            setTimeout(function() {
                self.cacheManager.store(cacheName, self.toCacheDB(self.cache));
            }, this.options.cacheSaveDelay);
        }

        // For each entry check to see if it exists in the pending list
        var len = results.length;
        while (len--) {
            this.removePending(results[len], true);
        }

        this.notifyPendingRequests();
        this.notifyLengthObservers();
    },
    loadRangeFailureHandler: function(sequenceId, readOffset, readLimit, response) {
        Mojo.Log.info("Load range failure: this.sequenceId: %d sequenceId: %d readOffset: %d readLimit: %d", this.sequenceId, sequenceId, readOffset, readLimit);
        if (sequenceId !== this.sequenceId) {
            Mojo.Log.info("Ignoring remote %s failure response due to invalid sequence sequnceId: %d readOffset: %d readLimit: %d ", this.getCacheName(), sequenceId, readOffset, readLimit);
            return;
        }

        var len = this.blockedRequests.length,
            readRange = { offset: readOffset, limit: readLimit };
        for (var i = 0; i < len; i++) {
            var entry = this.blockedRequests[i];
            if (this.rangeOverlap(readRange, entry)) {
                Mojo.Log.info("Process failure blocked request: %j", entry);
                entry.onFailure && entry.onFailure.curry(readOffset, readLimit, response).defer();

                this.blockedRequests.splice(i, 1);
                i--;    len--;
            }
        }
    },
    rangeOverlap: function(rangeOne, rangeTwo) {
        if (rangeOne.offset > rangeTwo.offset) {
            // Swap the vars so the rangeOne is always the first element
            var tmp = rangeOne;
            rangeOne = rangeTwo;
            rangeTwo = tmp;
        }

        var oneLen = rangeOne.offset + rangeOne.limit;
        if (oneLen > rangeTwo.offset) {
            // Range one extends into range two
            return {
                offset: rangeTwo.offset,
                limit: Math.min(oneLen, rangeTwo.offset+rangeTwo.limit)
            };
        }
    },

    notifyPendingRequests: function() {
        // TODO : Add tests for this with pending data involved
        var len = this.blockedRequests.length,
            cacheLen = this.headPending.length + this.cache.length + this.tailPending.length;
        for (var i = 0; i < len; i++) {
            var entry = this.blockedRequests[i];
            if (this.complete || entry.offset < cacheLen) {
                Mojo.Log.info("Process blocked request: %j", entry);
                var rangeData = this.extractRange(entry.offset, entry.limit);
                if (this.complete || rangeData.available.length) {
                    entry.onSuccess.curry(entry.offset, rangeData.available.length, rangeData.available).defer();

                    if (this.remoteLoaded) {
                        if (!rangeData.remainingLimit) {
                            this.blockedRequests.splice(i, 1);
                            i--;    len--;
                        } else {
                            entry.offset = rangeData.remainingOffset;
                            entry.limit = rangeData.remainingLimit;
                        }
                    }
                }
            }
        }
    },
    extractRange: function(offset, limit) {
        var cacheRet = [],
            remainingOffset = offset,
            remainingLimit = limit;

        // Pull any data out of the pending head list
        var dataOffset = offset;
        dataOffset = this.extractFromArray(dataOffset, remainingLimit, this.headPending, cacheRet);
        var headUsed = cacheRet.length;

        // Adjust the offset to be relative to the cache
        remainingOffset = Math.max(0, remainingOffset-headUsed);
        remainingLimit -= headUsed;

        dataOffset = this.extractFromArray(dataOffset, remainingLimit, this.cache, cacheRet);
        var cacheUsed = this.remoteLoaded ? cacheRet.length - headUsed : 0;

        // Adjust the offset to be relative to the end of the cache
        remainingOffset += cacheUsed;
        remainingLimit -= cacheUsed;

        // Load the tail sections, we don't care about the outcome here as it is "temp" data
        this.extractFromArray(dataOffset, remainingLimit, this.tailPending, cacheRet);

        return {
            available: cacheRet,
            remainingOffset: remainingOffset,
            remainingLimit: remainingLimit
        };
    },
    extractFromArray: function(offset, limit, src, dest) {
        if (offset >= 0 && limit > 0) {
            dest.push.apply(dest, src.slice(offset, offset+limit));
        }
        return Math.max(0, offset - src.length);
    },

    refreshSuccessHandler: function(limit, readLimit, onSuccess, results, resultOffset, responseLen) {
        Mojo.Log.info("Refreshed %s from remote. readLimit: %d  results: %d  resultOffset: %d", this.getCacheName(), readLimit, results.length, resultOffset);

        if (resultOffset) {
            // If this is segmented, we want to treat future results as a generic load range operation without a callback
            this.loadRangeSuccessHandler(this.sequenceId, 0, readLimit, 0, results, resultOffset, responseLen);
            return;
        }

        var cacheName = this.getCacheName(),
            changed = this.getChangedElements(results, this.cache);

        resultOffset = resultOffset || 0;

        this.remoteLoaded = true;
        this.complete = this.setComplete(results, readLimit, resultOffset, responseLen);
        this.requestUpperBound = readLimit;
        this.cache = results;

        // Clear out any pending lists
        this.headPending = [];
        this.tailPending = [];

        if (cacheName && (!responseLen || this.cache.length === responseLen)) {
            this.savedCache = true;
            var self = this;
            setTimeout(function() {
                self.cacheManager.store(cacheName, self.toCacheDB(results));
            }, this.options.cacheSaveDelay);
        }

        onSuccess({ results: results, changed: changed, limit: limit });
        this.notifyLengthObservers();
    },

    notifyLengthObservers: function() {
        this.lengthObservable && this.lengthObservable.notifyObservers({model: this, length: this.getKnownSize()});
    },

    toCacheDB: function(data) {
        return JSON.stringify(data);
    },
    fromCacheDB: function(data) {
        return data && JSON.parse(data);
    },
});
