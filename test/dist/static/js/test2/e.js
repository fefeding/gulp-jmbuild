define("test2/e", [ "../b" ], function(i, n, t) {
    var b = i("../b");
    n.init = function() {
        b.init("b");
    };
});