define("n", [ "./a" ], function(require, exports, module) {
    var a = require("./a");
    exports.init = function() {
        alert("n");
    };
});