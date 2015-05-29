
console.log('start build');
var jshint = require('gulp-jshint');
var Q = require('q');
//var workerFarm = require('worker-farm');
var gulp = require('gulp');
//var transport = require("gulp-seajs-transport");
//var transport = require('gulp-transport');


var path = require('path');

var transport = require('../../index.js');

console.log('require transport');
//配置文件
var config = {
    "root": path.resolve('../'),   
    "dest": "dist",
    "jsDest": "static/js",
    "htmlDest": "",
    "cssDest": "static/css",
    "jsBase": "static/js",
    "md5Separator": ".",
    "md5Size": 8,
    "js": [
        {
            "source": "static/js/*.js",
            'md5': true
        },
        {
            "source": ["static/js/test/**/*.js"],
            "concat": "t.js",
            'md5': true,
            "dest": 'test'
        }
    ],
    "css": [
        {
            "source": "static/css/*.css",
            "md5": true
        }
    ],
    "html": [
        {
            "source": "index.html",
            "includeModule": true
        }
    ],
    "files": [
        {
            "source": "static/img/*.*",
            "md5": true,
            "dest": "static/img"
        }
    ]
};

//清空构建记录
transport.clearInfo();

//语法检测
gulp.task('jshint', function () { 
    var sources = [];
    if(config.js && config.js.length) {
        for(var i=0;i<config.js.length;i++) {
            if(typeof config.js[i] == 'string') {
                sources.push(config.js[i]);
            }
            else {
                if(Array.isArray(config.js[i].source)) {
                    sources = sources.concat(config.js[i].source);
                }
                else {                   
                    sources.push(config.js[i].source); 
                }
            }
        }
    }
    console.log('jshint:');
    return gulp.src(sources, {cwd:config.root})
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});


//压缩JS
var jstasks = transport.createJSTask(gulp, config, ['jshint']);
gulp.task('minifyJS', jstasks,function (){
    console.log('minifyJS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//一般文件处理
var filetasks = transport.createFILETask(gulp, config, []);
gulp.task('cpFile', filetasks,function (){
    console.log('cpFile-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//压缩css
var csstasks = transport.createCSSTask(gulp, config, ['cpFile']);
gulp.task('minifyCSS', csstasks,function (){
    console.log('minifyCSS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});



//html解析主任务
var htmlTasks = transport.createHTMLTask(gulp, config, ['minifyJS', 'minifyCSS']);
gulp.task('parseHTML', htmlTasks, function (){
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//监听
//gulp.task('watch', function () {
 //   gulp.watch(sources, tasks);
//});

gulp.task('default', ['jshint','minifyJS', 'cpFile', 'minifyCSS','parseHTML']);



//gulp.task('default', function() {
  // place code for your default task here
//});


