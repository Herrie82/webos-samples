
const FLOW = [
        { className: "first", left: 0, center: 1, right: 2 },
        { className: "second", left: 2, center: 0, right: 1 },
        { className: "third", left: 1, center: 2, right: 0 },
    ];

// Aspect ratio of maximum display region for a single image. This needs to be kept in sync
// with the CSS source.
const IMAGE_DISPLAY_ASPECT_RATIO = 0.66;

Mojo.Widget.PreviewImage = Class.create({
    initialize: function() {
        // Avoid creating more locals in here as they will be kept alive by the closures in this method.
        var self = this;

        this.tapHandler = function(event) { return self.tap(event); };
        this.dragStartHandler = function(event) { return self.dragStart(event); };
        this.draggingHandler = function(event) { return self.dragging(event); };
        this.dragEndHandler = function(event) { return self.dragEnd(event); };
        this.flickHandler = function(event) { return self.flick(event); };

        this.curOffset = 0;
        this.flowPos = 0;

        // TODO : Is there another way we can do this?
        this.tileWidth = 200; // 180 + 10 + 10
        this.dragBoundary = this.tileWidth / 1.8;

        this.centerQueue = new OperationQueue();
    },

    setup: function() {
        this.initializeDefaultValues();
        this.renderWidget();

        this.controller.exposeMethods(['leftUrlProvided', 'centerUrlProvided', 'rightUrlProvided']);
    },

    initializeDefaultValues: function() {
        this.dataModel = this.controller.model;
        this.divPrefix = Mojo.View.makeUniqueId() + this.controller.scene.sceneId + this.controller.element.id;
    },
    renderWidget: function() {
        var content = Mojo.View.render({
            object: {
                divPrefix: this.divPrefix
            },
            template: "preview-image/preview-image"
        });
        Element.insert(this.controller.element, content);

        this.container = this.controller.element.querySelector(".preview-image");

        this.refreshReferences();

        this.controller.listen(this.controller.element, Mojo.Event.tap, this.tapHandler);
        this.controller.listen(this.controller.element, Mojo.Event.dragStart, this.dragStartHandler);
        this.controller.listen(this.controller.element, Mojo.Event.dragging, this.draggingHandler);
        this.controller.listen(this.controller.element, Mojo.Event.dragEnd, this.dragEndHandler);
        this.controller.listen(this.controller.element, Mojo.Event.flick, this.flickHandler);
    },

    cleanup: function() {
        this.controller.stopListening(this.controller.element, Mojo.Event.tap, this.tapHandler);
        this.controller.stopListening(this.controller.element, Mojo.Event.dragStart, this.dragStartHandler);
        this.controller.stopListening(this.controller.element, Mojo.Event.dragging, this.draggingHandler);
        this.controller.stopListening(this.controller.element, Mojo.Event.dragEnd, this.dragEndHandler);
        this.controller.stopListening(this.controller.element, Mojo.Event.flick, this.flickHandler);
    },

    tap: function(event) {
        var target = event.target;
        function compare(el) {
            return target === el || target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_CONTAINS;
        }
        if (this.hasLeft && compare(this.leftEl)) {
            this.animatedMove(false);
        } else if (this.hasRight && compare(this.rightEl)) {
            this.animatedMove(true);
        }
    },

    dragStart: function(event) {
        this.dragOff = 0;
        event.preventDefault();
    },
    dragging: function(event) {
        var distance = event.distance,
            rightDrag = event.down.screenX < event.move.screenX;

        this.slide((rightDrag ? 1 : -1) * distance.x);
    },
    dragEnd: function(event) {
        var moveDir;
        // TODO : Magic number
        // If we have slid some, but not enough to cause a move, force a move after the fact
        if (!this.dragOff && Math.abs(this.curOffset) > 25) {
            moveDir = this.canMove(this.curOffset);
        }

        this.animatedMove(moveDir);
    },

    flick: function(event) {
        this.flicked = true;
    },

    slide: function(offset) {
        var self = this,
            moveDir;

        // Adjust the offset by the number of screens that we have swapped
        offset += this.dragOff;

        if (Math.abs(offset) > this.dragBoundary) {
            moveDir = this.canMove(offset);

            if (moveDir !== undefined) {
                var offSize = (offset > 0 ? -1 : 1) * this.tileWidth;
                this.dragOff += offSize;
                offset += offSize;
            }
        }

        this.container.style.setProperty("left", offset + "px", "");

        this.curOffset = offset;

        if (moveDir !== undefined) {
            this.move(moveDir);
        }
    },
    resetSlide: function() {
        this.curOffset = 0;

        this.flicked = false;

        // Cleanup the transition properties
        this.container.style.removeProperty("left");
    },

    canMove: function(offset) {
        if (offset < 0) {
            if (this.hasRight) {
                return true;
            }
        } else {
            if (this.hasLeft) {
                return false;
            }
        }
    },
    animatedMove: function(moveLeft) {
        var self = this,
            container = this.container;

        if (moveLeft !== undefined) {
            var offSize = (moveLeft ? 1 : -1) * this.tileWidth;
            this.curOffset += offSize;
            container.style.setProperty("left", this.curOffset + "px", "");

            this.move(moveLeft);
        }

        this.dragOff = 0;

        // Bounce back to the default position
        Mojo.Animation.animateStyle(container, "left", "linear", {
                from: parseInt(container.style.left),
                to: 0,
                duration: this.flicked ? 0.2 : 0.4,
                styleSetter: function(value) {
                    self.slide(value);
                },
                onComplete: function(el) {
                    self.resetSlide();
                }
            });
    },

    move: function(moveLeft) {
        if (moveLeft === undefined) {
            return;
        }

        this.flowPos = (this.flowPos + (moveLeft ? -1 : 1)) % FLOW.length;
        if (this.flowPos < 0) {
            this.flowPos = FLOW.length - 1;
        }

        var el = this.container,
            curFlow = FLOW[this.flowPos];

        // Use a single class operation to roll the images. Note that we are hitting
        // the className directly to reduce the possiblity of a reflow between operations
        el.className = el.className.replace(/\b(?:first|second|third)\b/, curFlow.className);

        this.refreshReferences();
        this.refreshImageStates();

        if (moveLeft) {
            // Clear the right image if we are going to be waiting for awhile
            this.hasRight = false;
            this.resetContainer(this.rightEl.firstElementChild);

            this.dataModel.onRightFunction();
        } else {
            // Clear the left image if we are going to be waiting for awhile
            this.hasLeft = false;
            this.resetContainer(this.leftEl.firstElementChild);

            this.dataModel.onLeftFunction();
        }

        // If we are blocking on the center load, stop, we now have a new focus
        (this.centerQueue.getSuccessHandler())();
    },
    refreshReferences: function() {
        // Scan the child element linked list until we have the expected number of els
        var curFlow = FLOW[this.flowPos],
            curChild = this.container.firstElementChild,
            childEl = [];
        while (curChild && childEl.length < 3) {
            childEl.push(curChild);
            curChild = curChild.nextElementSibling;
        }
        this.leftEl = childEl[curFlow.left];
        this.centerEl = childEl[curFlow.center];
        this.rightEl = childEl[curFlow.right];
    },
    refreshImageStates: function() {
        this.hasLeft = !!this.leftEl.querySelector("img,.loading");
        this.hasRight = !!this.rightEl.querySelector("img,.loading");
    },

    leftUrlProvided: function(url, orientation) {
        Mojo.Log.info("leftUrlProvided %s", url);
        this.imageLoader(this.leftEl.firstElementChild, url, orientation);
    },
    centerUrlProvided: function(url, orientation) {
        Mojo.Log.info("centerUrlProvided %s", url);
        this.imageLoader(this.centerEl.firstElementChild, url, orientation, true);
    },
    rightUrlProvided: function(url, orientation) {
        Mojo.Log.info("rightUrlProvided %s", url);
        this.imageLoader(this.rightEl.firstElementChild, url, orientation);
    },

    resetContainer: function(container) {
        container.addClassName("empty");
        container.removeClassName("loading");
        container.innerHTML = "";
        container.style.removeProperty("background-image");
    },
    imageLoader: function(container, url, orientation, center) {
        var self = this;
        if (url) {
            var img = this.controller.document.createElement("img");
            img.addEventListener("load", function() {
                if (!img.parentNode) {
                    // Ignore this load if there was a future load that overrides this
                    Mojo.Log.info("Dropping concurrent image load: %s %s", img.src, (container.querySelector("img") || {}).src);
                    return;
                }

                if (!orientation) {
                    if (img.naturalWidth/img.naturalHeight > IMAGE_DISPLAY_ASPECT_RATIO) {
                        img.addClassName("landscape");
                        img.removeClassName("portrait");
                    } else {
                        img.addClassName("portrait");
                        img.removeClassName("landscape");
                    }
                } else {
                    img.addClassName(orientation);
                }

                if (center) {
                    (self.centerQueue.getSuccessHandler())();
                }
                container.removeClassName("loading");
            });

            container.addClassName("loading");
            container.removeClassName("empty");
            if (center) {
                container.appendChild(img);
                img.src = url;
            } else {
                this.centerQueue.queue(function() {
                    container.appendChild(img);
                    img.src = url;
                });
            }
            this.refreshImageStates();
        } else if (center) {
            this.centerQueue.reset();
        }
    }
});
