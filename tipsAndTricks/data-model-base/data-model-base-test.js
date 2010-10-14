/* Copyright 2010 Palm, Inc. All rights reserved. */
/* DataModelBase testcases. See data-model-base/README */
function DataModelBaseTest() {}

DataModelBaseTest.prototype.exec = function(assistant, cont) {
    execChain(assistant, cont, [
            this.zeroOffset,
            this.positiveOffset,
            this.negativeOffset,
            this.outOfSightOffset,
            this.cacheReadTest,
            this.depotCacheReadTest,
            this.cacheExpandTest,
            this.overlappingRequestsTest,
            this.refreshTest,
            this.cancelTest,
            this.failureTest,
            this.headPendingTest,
            this.preSeedHeadPendingTest,
            this.tailPendingTest,
            this.tailPendingRemoveTest,
        ], 0)();
};

DataModelBaseTest.prototype.zeroOffset = function(assistant, cont) {
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    });

    dataModel.getRange(0, 2,
        function(offset, limit, results) {
            verifyRange(
                    assistant, {
                        offset: 0,
                        limit: 2,
                        complete: false,
                        knownSize: 4,
                        loadRangeCount: 1,
                        loadRange: { offset: 0, limit: 4 },
                        results: [ 10, 9 ]
                    },
                    dataModel, offset, limit, results);

            cont();
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.positiveOffset = function(assistant, cont) {
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    });

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            verifyRange(
                assistant, {
                    offset: 4,
                    limit: 2,
                    complete: false,
                    knownSize: 8,
                    loadRangeCount: 1,
                    loadRange: { offset: 0, limit: 8 },
                    results: [ 6, 5 ]
                },
                dataModel, offset, limit, results);

            cont();
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.negativeOffset = function(assistant, cont) {
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    });

    dataModel.getRange(-4, 2,
        function(offset, limit, results) {
            assistant.failure("Recieved success: " + Object.toJSON(results));

            cont();
        },
        function(result) {
            if (dataModel.loadRangeHistory.length !== 0) {
                assistant.failure("Unexpected load history: " + Object.toJSON(dataModel.loadRangeHistory));
            }
            cont();
        });
};

DataModelBaseTest.prototype.outOfSightOffset = function(assistant, cont) {
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    });

    dataModel.getRange(12, 2,
        function(offset, limit, results) {
            verifyRange(
                assistant, {
                    offset: 12,
                    limit: 2,
                    complete: true,
                    knownSize: 10,
                    loadRangeCount: 1,
                    loadRange: { offset: 0, limit: 16 },
                    results: []
                },
                dataModel, offset, limit, results);

            cont();
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        })
};

DataModelBaseTest.prototype.cacheReadTest = function(assistant, cont) {
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    });

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            verifyRange(
                assistant, {
                    offset: 4,
                    limit: 2,
                    complete: false,
                    knownSize: 8,
                    loadRangeCount: 1,
                    loadRange: { offset: 0, limit: 8 },
                    results: [ 6, 5 ]
                },
                dataModel, offset, limit, results);

            dataModel.getRange(0, 3,
                    function(offset, limit, results) {
                        verifyRange(
                            assistant, {
                                offset: 0,
                                limit: 3,
                                complete: false,
                                knownSize: 8,
                                loadRangeCount: 1,
                                loadRange: { offset: 0, limit: 8 },
                                results: [ 10, 9, 8 ]
                            },
                            dataModel, offset, limit, results);

                        cont();
                    },
                    function(failure) {
                        assistant.failure("Recieved failure");
                        cont();
                    });
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.depotCacheReadTest = function(assistant, cont) {
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2,
        cacheSaveDelay: 0
    });
    dataModel.getCacheName = function() { return "dataModelTest-Depot"; };

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            verifyRange(
                assistant, {
                    offset: 4,
                    limit: 2,
                    complete: false,
                    knownSize: 8,
                    loadRangeCount: 1,
                    loadRange: { offset: 0, limit: 8 },
                    results: [ 6, 5 ]
                },
                dataModel, offset, limit, results);

            dataModel = new DataModelTest({
                maxCount: 10,
                lookahead: 2,
                cacheSaveDelay: 0
            });
            dataModel.getCacheName = function() { return "dataModelTest-Depot"; };

            // Allow us to stack a few requests
            dataModel.blockTimeout = 100;
            dataModel.offset = 10;
            dataModel.getRange(0, 10,
                    function(offset, limit, results) {
                        if (dataModel.blockTimeout) {
                            verifyRange(
                                assistant, {
                                    offset: 0,
                                    limit: 10,
                                    complete: false,
                                    knownSize: 8,
                                    loadRangeCount: 0,
                                    results: [ 10, 9, 8, 7, 6, 5, 4, 3 ]
                                },
                                dataModel, offset, limit, results);

                            dataModel.blockTimeout = 0;
                        } else {
                            verifyRange(
                                    assistant, {
                                        offset: 0,
                                        limit: 10,
                                        complete: true,
                                        knownSize: 10,
                                        loadRangeCount: 1,
                                        loadRange: { offset: 0, limit: 12 },
                                        results: [ 20, 9, 8, 7, 6, 5, 4, 3, 2, 1 ]
                                    },
                                    dataModel, offset, limit, results);

                            cont();
                        }
                    },
                    function(failure) {
                        assistant.failure("Recieved failure");
                        cont();
                    });
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.cacheExpandTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    }),
    expected = [
        {
            offset: 3,
            limit: 5,
            knownSize: 8,
            complete: false,
            loadRangeCount: 2,
            loadRange: { offset: 8, limit: 14 },
            results: [ 7, 6, 5, 4, 3 ]
        },
        {
            offset: 8,
            limit: 7,
            knownSize: 10,
            complete: true,
            loadRangeCount: 2,
            loadRange: { offset: 8, limit: 14 },
            results: [ 2, 1 ]
        }
    ];
    

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            verifyRange(
                assistant, {
                    offset: 4,
                    limit: 2,
                    complete: false,
                    knownSize: 8,
                    loadRangeCount: 1,
                    loadRange: { offset: 0, limit: 8 },
                    results: [ 6, 5 ]
                },
                dataModel, offset, limit, results);

            dataModel.getRange(3, 12,
                    function(offset, limit, results) {
                        verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

                        if (runCount >= 2) {
                            cont();
                        }
                    },
                    function(failure) {
                        assistant.failure("Recieved failure");
                        cont();
                    });
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};


DataModelBaseTest.prototype.overlappingRequestsTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    });

    function finalize() {
        if (dataModel.loadRangeHistory.length !== 2) {
            assistant.failure("Incorrect query count: " + Object.toJSON(dataModel.loadRangeHistory));
        }
        var hist = dataModel.loadRangeHistory,
            len = hist.length;
        while (len--) {
            var entry = hist[len];
            if (!((entry.offset === 0 && entry.limit === 6) || (entry.offset === 6 && entry.limit === 4))) {
                assistant.failure("Incorrect query content: " + Object.toJSON(entry));
            }
        }

        if (dataModel.getKnownSize() !== 10) {
            assistant.failure("Unexpected known count " + dataModel.getKnownSize());
        }
        if (dataModel.isComplete()) {
            assistant.failure("dataModal marked complete");
        }

        cont();
    }
    // Allow us to stack a few requests
    dataModel.blockTimeout = 100;

    dataModel.getRange(2, 2,
        function(offset, limit, results) {
        Mojo.Log.info("2 2 read offset: %d limit: %d results: %j", offset, limit, results);
            verifyRange(
                assistant, {
                    offset: 2,
                    limit: 2,
                    results: [ 8, 7 ]
                },
                dataModel, offset, limit, results);
            if (++runCount >= 2) {
                finalize();
            }
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            Mojo.Log.info("4 2 read offset: %d limit: %d results: %j", offset, limit, results);
            verifyRange(
                assistant, {
                    offset: 4,
                    limit: 2,
                    results: [ 6, 5 ]
                },
                dataModel, offset, limit, results);
            if (++runCount >= 2) {
                finalize();
            }
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
    dataModel.blockTimeout = 0;
};

DataModelBaseTest.prototype.refreshTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2,
        initialPageSize: 6
    });

    function postInit() {
        var returnCount = 0;
        // Allow us to stack a few requests
        dataModel.blockTimeout = 100;
        dataModel.offset = 10;

        // Load in process
        dataModel.getRange(4, 2,
            function(offset, limit, results) {
                verifyRange(
                    assistant, {
                        offset: 4,
                        limit: 2,
                        knownSize: 6,
                        complete: false,
                        loadRangeCount: 1,
                        results: [ 6, 5 ]
                    },
                    dataModel, offset, limit, results);
                if (++returnCount !== 1) {
                    assistant.failure("Refresh call was not blocking: prerequest");
                }
            },
            function(failure) {
                assistant.failure("Recieved failure");
                cont();
            });

        dataModel.refresh(
                function(results) {
                    verifyRange(
                            assistant, {
                                offset: 0,
                                limit: 0,
                                knownSize: 8,
                                complete: false,
                                loadRangeCount: 2,
                                results: [ 20, 9, 8, 7, 6, 5, 4, 3 ]
                            },
                            dataModel, 0, 0, results.results);
                    if (++returnCount !== 2) {
                        assistant.failure("Refresh call was not blocking: refresh1");
                    }
                },
                function() {
                    assistant.failure("Failure called");
                    cont();
                });

        dataModel.refresh(
                function(results) {
                    verifyRange(
                            assistant, {
                                offset: 0,
                                limit: 0,
                                knownSize: 8,
                                complete: false,
                                loadRangeCount: 2,
                                results: [ 20, 9, 8, 7, 6, 5, 4, 3 ]
                            },
                            dataModel, 0, 0, results.results);
                    if (++returnCount !== 3) {
                        assistant.failure("Refresh call was not blocking");
                    }
                },
                function() {
                    assistant.failure("Failure called");
                    cont();
                });

        dataModel.getRange(4, 2,
            function(offset, limit, results) {
                verifyRange(
                    assistant, {
                        offset: 4,
                        limit: 2,
                        knownSize: 8,
                        complete: false,
                        loadRangeCount: 2,
                        results: [ 6, 5 ]
                    },
                    dataModel, offset, limit, results);
                if (++returnCount !== 4) {
                    assistant.failure("Refresh call was not blocking");
                }
                if (returnCount >= 3) {
                    cont();
                }
            },
            function(failure) {
                assistant.failure("Recieved failure");
                cont();
            });
        dataModel.blockTimeout = 0;
    }

    dataModel.getRange(2, 2,
        function(offset, limit, results) {
        Mojo.Log.info("2 2 read offset: %d limit: %d results: %j", offset, limit, results);
            verifyRange(
                assistant, {
                    offset: 2,
                    limit: 2,
                    complete: false,
                    knownSize: 6,
                    loadRangeCount: 1,
                    loadRange: { offset: 0, limit: 6 },
                    results: [ 8, 7 ]
                },
                dataModel, offset, limit, results);
            postInit();
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.cancelTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2,
        initialPageSize: 6
    });

    // Allow us to stack a few requests
    dataModel.blockTimeout = 100;
    dataModel.offset = 10;

    // Load in process
    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            assistant.failure("Recieved success after canceled call " + offset + " " + limit + " " + results);
        },
        function(failure) {
            Mojo.Log.info("Failure");
            cont();
        });

    // Ensure that cancel happens after the above request has been primed
    dataModel.refreshQueue.queue({
        onSuccess: function() {
            dataModel.cancel();
            dataModel.blockTimeout = 0;
        }
    });
};

DataModelBaseTest.prototype.failureTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2,
        initialPageSize: 6
    });

    // Allow us to stack a few requests
    dataModel.blockTimeout = 100;
    dataModel.offset = 10;
    dataModel.shouldFail = "FAIL";

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            assistant.failure("Recieved success after failure 1");
        },
        function(offset, limit, failure) {
            Mojo.Log.info("FailureTest: result 1");
            if (failure !== "FAIL") {
                assistant.failure("Unexpected failure value: " + failure);
            }
            if (offset !== 0) {     // loadRange request offset
                assistant.failure("Unexpected failure offset: " + offset);
            }
            if (limit !== 8) {      // loadRange request limit
                assistant.failure("Unexpected failure limit: " + limit);
            }
            if (runCount++ !== 0) {
                assistant.failure("Unexpected run count: exec 1");
            }
        });

    dataModel.getRange(4, 2,
        function(offset, limit, results) {
            assistant.failure("Recieved success after failure 2");
        },
        function(offset, limit, failure) {
            Mojo.Log.info("FailureTest: result 2");
            if (failure !== "FAIL") {
                assistant.failure("Unexpected failure value: " + failure);
            }
            if (offset !== 0) {     // loadRange request offset
                assistant.failure("Unexpected failure offset: " + offset);
            }
            if (limit !== 8) {      // loadRange request limit
                assistant.failure("Unexpected failure limit: " + limit);
            }
            if (runCount++ !== 1) {
                assistant.failure("Unexpected run count: exec 2");
            }
            cont();
        });

    dataModel.refreshQueue.queue({
        onSuccess: function() {
            Mojo.Log.info("Block timeout: %j", dataModel.blockedRequests);
            dataModel.blockTimeout = 0;
        }
    });
};

DataModelBaseTest.prototype.headPendingTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 1
    }),
    expected = [
        {
            offset: 0,
            limit: 4,
            complete: false,
            knownSize: 5,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 5 },
            results: [ 10, 9, 8, 7 ],
            headPending: []
        },
        {
            offset: 1,
            limit: 2,
            complete: false,
            knownSize: 7,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 5 },
            results: [ 12, 10 ],
            headPending: [ 11, 12 ]
        },
        {
            offset: 0,
            limit: 2,
            complete: false,
            knownSize: 6,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 5 },
            results: [ 12, 10 ],
            headPending: [ 12 ]
        }
    ];

    dataModel.getRange(0, 4,
        function(offset, limit, results) {
            verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

            dataModel.addPending(12, false);
            dataModel.addPending(11, false);

            dataModel.getRange(1, 2,
                function(offset, limit, results) {
                    verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

                    dataModel.removePending(11, false);

                    dataModel.getRange(0, 2,
                        function(offset, limit, results) {
                            verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

                            cont();
                        },
                        function(failure) {
                            assistant.failure("Recieved failure");
                            cont();
                        });
                },
                function(failure) {
                    assistant.failure("Recieved failure");
                    cont();
                });
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.preSeedHeadPendingTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    }),
    expected = [
        {
            offset: 1,
            limit: 1,
            complete: false,
            knownSize: 2,
            results: [ 12 ],
            headPending: [ 11, 12 ]
        },
        {
            offset: 2,
            limit: 1,
            complete: false,
            knownSize: 6,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 4 },
            results: [ 10 ],
            headPending: [ 11, 12 ]
        },
        {
            offset: 0,
            limit: 3,
            complete: false,
            knownSize: 6,
            results: [ 11, 12, 10 ],
            headPending: [ 11, 12 ]
        }
    ];

    dataModel.addPending(12, false);
    dataModel.addPending(11, false);

    dataModel.getRange(1, 2,
        function(offset, limit, results) {
            verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

            if (runCount >= 2) {
                dataModel.getRange(0, 3,
                    function(offset, limit, results) {
                        verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);
    
                        cont();
                    },
                    function(failure) {
                        assistant.failure("Recieved failure");
                        cont();
                    });
            }
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.tailPendingTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 10,
        lookahead: 2
    }),
    expected = [
        {
            offset: 1,
            limit: 1,
            complete: false,
            knownSize: 2,
            results: [ 5 ],
            tailPending: [ 10, 5 ]
        },
        {
            offset: 1,
            limit: 2,
            complete: false,
            knownSize: 6,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 5 },
            results: [ 9, 8 ],
            tailPending: [ 5 ]
        },
        {
            offset: 5,
            limit: 1,
            knownSize: 6,
            complete: false,
            loadRangeCount: 2,
            loadRange: { offset: 5, limit: 3 },
            results: [ 5 ],
            tailPending: [ 5 ]
        },
        {
            offset: 5,
            limit: 1,
            knownSize: 8,
            complete: false,
            loadRangeCount: 2,
            loadRange: { offset: 5, limit: 3 },
            results: [ 5 ],
            tailPending: []
        }
    ];

    dataModel.addPending(10, true);
    dataModel.addPending(5, true);

    dataModel.getRange(1, 2,
        function(offset, limit, results) {
            verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

            if (runCount >= 2) {
                dataModel.getRange(5, 1,
                    function(offset, limit, results) {
                        verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

                        if (runCount >= 4) {
                            cont();
                        }
                    },
                    function(failure) {
                        assistant.failure("Recieved failure");
                        cont();
                    });
            }
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

DataModelBaseTest.prototype.tailPendingRemoveTest = function(assistant, cont) {
    var runCount = 0;
    var dataModel = new DataModelTest({
        maxCount: 4,
        lookahead: 3
    }),
    expected = [
        {
            offset: 0,
            limit: 1,
            complete: false,
            knownSize: 1,
            results: [ 11 ],
            tailPending: [ 11 ]
        },
        {
            offset: 0,
            limit: 2,
            complete: true,
            knownSize: 5,
            results: [ 4, 3 ],
            tailPending: [ 11 ]
        },
        {
            offset: 4,
            limit: 1,
            knownSize: 5,
            complete: true,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 5 },
            results: [ 11 ],
            tailPending: [ 11 ]
        },
        {
            offset: 3,
            limit: 1,
            knownSize: 4,
            complete: true,
            loadRangeCount: 1,
            loadRange: { offset: 0, limit: 5 },
            results: [1],
            tailPending: []
        }
    ];

    dataModel.addPending(11, true);

    dataModel.getRange(0, 2,
        function(offset, limit, results) {
            verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

            if (runCount >= 2) {
                dataModel.getRange(4, 1,
                    function(offset, limit, results) {
                        verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

                        dataModel.removePending(11, true);

                        dataModel.getRange(3, 2,
                            function(offset, limit, results) {
                                verifyRange(assistant, expected[runCount++], dataModel, offset, limit, results);

                                cont();
                            },
                            function(failure) {
                                assistant.failure("Recieved failure");
                                cont();
                            });
                    },
                    function(failure) {
                        assistant.failure("Recieved failure");
                        cont();
                    });
            }
        },
        function(failure) {
            assistant.failure("Recieved failure");
            cont();
        });
};

// TODO : Pending + Refresh test

var DataModelTest = Class.create(DataModelBase, {
    initialize: function($super, options) {
        $super(options);
        this.maxCount = options.maxCount;
        this.loadRangeHistory = [];
        this.offset = 0;
    },
    getCacheName: function() {
        return "dataModelTest-" + new Date().getTime();
    },
    refresh: function($super, onSuccess, onFailure) {
        this.loadRangeHistory = [];
        return $super(onSuccess, onFailure);
    },
    loadRange: function(offset, limit, onSuccess, onFailure) {
        // If the block flag is set, defer execution
        if (this.blockTimeout) {
            var self = this;
            setTimeout(function() {
                self.loadRange(offset, limit, onSuccess, onFailure);
            }, this.blockTimeout);
            return;
        }

        if (this.shouldFail) {
            onFailure(this.shouldFail);
            return;
        }

        this.loadRangeHistory.push({offset:offset, limit: limit});

        var ret = [];
        limit = Math.min(offset+limit, this.maxCount);

        for (var i = offset; i < limit; i++) {
            ret.push((this.maxCount - i) + (i === 0 ? this.offset : 0));
        }
        onSuccess.curry(ret).defer();
    }
});


function verifyRange(assistant, expected, dataModel, offset, limit, results) {
    expected = expected || { results: []};

    dataModel.execCount = (dataModel.execCount || 0) + 1;
    Mojo.Log.info("model exec count: %d", dataModel.execCount);
    if (offset !== expected.offset) {
        assistant.failure("offset incorrect: " + offset + " expected: " + expected.offset);
    }
    if (limit !== expected.limit) {
        assistant.failure("limit incorrect: " + limit + " expected: " + expected.limit);
    }
    if (expected.complete !== undefined && dataModel.isComplete() !== expected.complete) {
        assistant.failure("Data Model Marked as complete: " + dataModel.isComplete() + " expected: " + expected.complete);
    }
    if (expected.knownSize !== undefined && dataModel.getKnownSize() !== expected.knownSize) {
        assistant.failure("Data Model known size unexpected: " + dataModel.getKnownSize() + " expected: " + expected.knownSize);
    }
    if (expected.loadRangeCount !== undefined && dataModel.loadRangeHistory.length !== expected.loadRangeCount
            || (expected.loadRange !== undefined && (
                    dataModel.loadRangeHistory[expected.loadRangeCount-1].offset !== expected.loadRange.offset
                    || dataModel.loadRangeHistory[expected.loadRangeCount-1].limit !== expected.loadRange.limit)))  {
        assistant.failure("Unexpected load history: " + Object.toJSON(dataModel.loadRangeHistory) + " expected: " + expected.loadRangeCount + " " + Object.toJSON(expected.loadRange));
    }

    if (!results
            || results.length !== expected.results.length) {
        assistant.failure("Returned data incorrect: " + Object.toJSON(results) + " expected: " + Object.toJSON(expected.results));
    } else {
        var len = results.length;
        while (len--) {
            if (results[len] != expected.results[len]) {
                assistant.failure("Returned data incorrect index: " + len + "data: " + Object.toJSON(results) + " expected: " + Object.toJSON(expected.results));
            }
        }
    }

    if (expected.headPending) {
        if (expected.headPending.length !== dataModel.headPending.length) {
            assistant.failure("head Pending list does not match expectation: " + Object.toJSON(dataModel.headPending));
        }

        var len = dataModel.headPending.length;
        while (len--) {
            if (dataModel.headPending[len] != expected.headPending[len]) {
                assistant.failure("head pending incorrect index: " + len + "data: " + Object.toJSON(dataModel.headPending) + " expected: " + Object.toJSON(expected.headPending));
            }
        }
    }
    if (expected.tailPending) {
        if (expected.tailPending.length !== dataModel.tailPending.length) {
            assistant.failure("Tail Pending list does not match expectation: " + Object.toJSON(dataModel.tailPending));
        }

        var len = dataModel.tailPending.length;
        while (len--) {
            if (dataModel.tailPending[len] != expected.tailPending[len]) {
                assistant.failure("Tail pending incorrect index: " + len + "data: " + Object.toJSON(dataModel.tailPending) + " expected: " + Object.toJSON(expected.tailPending));
            }
        }
    }
}
