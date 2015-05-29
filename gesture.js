//  Class-free design for custom gesture creation
var gesture = (function () {
    "use strict";

    //    functions
    var angle;
    var angleDif;
    var forEach;
    var gestureCallbacks;
    var mag;
    var sq;

    //    constructors
    var TouchData;

    //    internal vars
    var keys;
    var gesture;
    var touchLastPosition;
    var touchStartPosition;
    var touchVars;

    //  Object that holds custom gesture definitions (unique names required)
    gestureCallbacks = {};

    //  Used to keep track of the registered gesture handlers without querying
    //  Object.keys every touch event
    keys = [];

    //  Gesture object for all the global functions
    gesture = {};

    //  Tracks the starting position, last known position, and custom variables for each touch
    touchStartPosition = {};
    touchLastPosition = {};
    touchVars = {};

    forEach = function (arrayLike, func) {
        Array.prototype.forEach.call(arrayLike, func);
    };

    //  Object for access to the touch properties used a lot
    TouchData = function (touch, evt) {
        var target;
        var time;
        var x;
        var y;

        x = touch.pageX;
        y = touch.pageY;
        time = evt.timeStamp;
        target = touch.target;

        return Object.freeze({
            position: Object.freeze({
                x: x,
                y: y
            }),
            time: time,
            target: target,
            ID: touch.identifier
        });
    };

    //  Adjusts the value returned by atan2 to be in degrees (0-360) with
    //  straight up being 0 degrees
    angle = function (first, second) {
        var angle;

        first = first.position;
        second = second.position;
        angle = Math.atan2(
            second.y - first.y,
            second.x - first.x
        );
        angle *= 180 / Math.PI;
        angle = (angle + 450) % 360;

        return angle;
    };

    //  Smallest angle between two given angles
    angleDif = function (first, second) {
        var dif = Math.abs(first - second);
        if (dif > 180) {
            dif = 360 - dif;
        }
        return dif;
    };
    gesture.angleDif = angleDif;

    //  Shortcut square function
    sq = function (n) {
        return n * n;
    };

    //  Gets the magnitude of the vector created by two points
    mag = function (first, second) {
        first = first.position;
        second = second.position;
        return Math.sqrt(
            sq(first.x - second.x) + sq(first.y - second.y)
        );
    };

    //  Registers a gesture handler.
    //      Callbacks should either be an object with 1 or more of the keys "start", "move", and "end"
    //      or a function that takes no arguments and returns an object like that.
    gesture.register = function (name, callbacks) {
        if (typeof callbacks === 'function') {
            callbacks = callbacks();
        }
        //  Anything not defined will be filled with an empty function
        //  If all the callbacks are empty functions it's a pretty useless handler
        gestureCallbacks[name] = {
            start:  callbacks.start || function () {},
            move:   callbacks.move || function () {},
            end:    callbacks.end || function () {}
        };
        //  Update keys on new registrations instead of querying every event
        keys = Object.keys(gestureCallbacks);
        //  Will be used by touch events
        touchVars[name] = {};
    };

    //  Creates and initializes a CustomEvent object and fills it with the properties in options, if any
    gesture.createCustomEvent = function (type, options) {
        var evt;

        evt = new CustomEvent(type, {cancelable: true, bubbles: true, detail: null});

        Object.keys(options || {}).forEach(
            function (key) {
                evt[key] = options[key];
            }
        );

        return evt;
    };

    //  The diagonal distance (in page pixels) of the screen
    gesture.diagonal = mag(
        {
            position: {
                x: 0,
                y: 0
            }
        },
        {
            position: {
                x:screen.width,
                y:screen.height
            }
        }
    );

    window.addEventListener(
        "touchstart",
        function (evt) {
            forEach(
                evt.changedTouches,
                function (touch) {
                    var touchData;

                    touchData = TouchData(touch, evt);

                    //  Sets the starting position (which is also the last known position)
                    touchStartPosition[touchData.ID] = touchData;
                    touchLastPosition[touchData.ID] = touchData;

                    keys.forEach(
                        function (key) {
                            touchVars[key][touchData.ID] = {};
                            gestureCallbacks[key].start(touchData, touchVars[key][touchData.ID]);
                        }
                    );
                }
            );
        }
    );
    window.addEventListener(
        "touchmove",
        function (evt) {
            forEach(
                evt.changedTouches,
                function (touch) {
                    var dif;
                    var lastPos;
                    var startPos;
                    var touchData;

                    touchData = TouchData(touch, evt);

                    //  Get the starting position and last position of the touch for math
                    startPos = touchStartPosition[touchData.ID];
                    lastPos = touchLastPosition[touchData.ID];

                    //  Does some math to get usefull information about the current touch
                    //  distance:   distance from the last position
                    //  angle:      angle of the vector from the last position
                    //  sDistance:  distance from the starting position
                    //  sAngle:     angle of the vector from the starting position
                    dif = Object.freeze({
                        distance:   mag(lastPos, touchData),
                        angle:      angle(lastPos, touchData),
                        sDistance:  mag(startPos, touchData),
                        sAngle:     angle(startPos, touchData)
                    });

                    keys.forEach(
                        function (key) {
                           gestureCallbacks[key].move(touchData, touchVars[key][touchData.ID], dif, startPos, lastPos);
                        }
                    );
                    touchLastPosition[touchData.ID] = touchData;
                }
            );
        }
    );
    window.addEventListener(
        "touchend",
        function (evt) {
            forEach(
                evt.changedTouches,
                function (touch) {
                    var startPos;
                    var tagName;
                    var touchData;

                    touchData = TouchData(touch, evt);
                    startPos = touchStartPosition[touchData.ID];
                    tagName = touchData.target.tagName.toLowerCase();

                    if (["input", "textarea"].indexOf(tagName) === -1 && evt.cancelable === true) {
                        evt.preventDefault();
                    }

                    keys.forEach(
                        function (key) {
                            gestureCallbacks[key].end(touchData, touchVars[key][touchData.ID], startPos);
                        }
                    );

                    //  Cleanup stuff
                    delete touchStartPosition[touchData.ID];
                    delete touchLastPosition[touchData.ID];
                    delete touchVars[touchData.ID];
                }
            );
        }
    );

    return Object.freeze(gesture);
})();

//  Create tap events
gesture.register(
    "tap",
    function () {
        "use strict";

        return {
            start: function (touch, vars) {
                vars.valid = true;
            },
            move: function (touch, vars, dif) {
                //  If they move too far it's not a tap anymore
                if (dif.sDistance > 20) {
                    vars.valid = false;
                }
            },
            end: function (touch, vars, start) {
                //  If it takes too long, its not a tap. otherwise, fire the event
                if (vars.valid === true && (touch.time - start.time) < 500) {
                    if (start.target !== document.activeElement && document.activeElement !== null) {
                        document.activeElement.blur();
                    }
                    start.target.dispatchEvent(
                        gesture.createCustomEvent(
                            "tap",
                            {touch: touch}
                        )
                    );
                }
            }
        };
    }
);

//  Create basic swipe events
gesture.register(
    "swipe",
    function () {
        "use strict";

        return {
            start: function (touch, vars) {
                vars.valid = true;
                vars.dist = 0;
            },
            move: function (touch, vars, dif) {
                //  If the angle between the last position vector and start position vector is too large
                //  then it's not a straight enough line for a swipe
                if (Math.abs(gesture.angleDif(dif.angle, dif.sAngle)) > 25) {
                    vars.valid = false;
                }
                vars.dist = dif.sDistance;
                vars.angle = dif.sAngle;
            },
            end: function (touch, vars, start) {
                var time;

                time = touch.time - start.time;
                //  If it's too fast or too short don't fire
                if (time > 500 || vars.valid === false || vars.dist < gesture.diagonal / 20) {
                    return;
                }
                start.target.dispatchEvent(
                    gesture.createCustomEvent(
                        "swipe",
                        {
                            swipe: {
                                startPosition:  start.position,
                                endPosition:    touch.position,
                                angle:          vars.angle,
                                distance:       vars.dist,
                                time:           time / 1000,
                                speed:          vars.dist / (time / 1000)
                            }
                        }
                    )
                );
            }
        };
    }
);

//  Create hold events
gesture.register(
    "hold",
    function () {
        "use strict";

        var callback;
        var timeouts;

        timeouts = {};

        //  I'm lazy so I generate a callback for a given touch to pass to setTimeout
        callback = function (touch) {
            return function () {
                timeouts[touch.ID] = null;
                touch.target.dispatchEvent(
                    gesture.createCustomEvent(
                        "hold",
                        {position:touch.position}
                    )
                );
            };
        };

        return {
            start: function (touch) {
                timeouts[touch.ID] = setTimeout(callback(touch), 1000);
            },
            move: function (touch, vars, dif) {
                if(dif.sDistance > 20) {
                    clearTimeout(timeouts[touch.ID]);
                    timeouts[touch.ID] = null;
                }
            },
            end: function (touch) {
                if(timeouts[touch.ID] !== null) {
                    clearTimeout(timeouts[touch.ID]);
                }
            }
        };
    }
);
