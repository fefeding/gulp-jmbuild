define("test/c", [ "../b" ], function(i, n, t) {
    var b = i("../b");
    n.init = function() {
        b.init("b");
    };
});