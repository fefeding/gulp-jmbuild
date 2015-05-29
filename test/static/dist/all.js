define("a", [], function(require, exports, module) {
    exports.run = function() {
        alert("i am a");
    };
});
define("b", [ "./a" ], function(require, exports, module) {
    var a = require("./a");
    exports.init = function() {
        a.run("b");
    };
});
define("test/c", [ "../b" ], function(require, exports, module) {
    var b = require("../b");
    exports.init = function() {
        b.init("b");
    };
});