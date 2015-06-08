
console.log('start build');

var jshint = require('gulp-jshint');
var Q = require('q');
var gulp = require('gulp');
var path = require('path');
var Stream = require('stream');

var cssbase64 = require('gulp-base64');


var jmbuild = require('../../index.js');

//配置文件
var config = {
    //项目根路径，后面的路径基本都是相对于它的。
    "root": path.resolve('../'),   
    //构建目标目录，相对于root
    "dest": "dist",
    //js文件构建目标目录，相对于dest,,,如果你想把它放在不同的地方，可以用类似于../这种改变根路径的方法。
    "jsDest": "static/js",
    //html文件构建目标目录，相对于dest
    "htmlDest": "",
    //css文件构建目标目录，相对于dest
    "cssDest": "static/css",
    //JS文件基础路径段，主要用于模块化提取模块id用处，比例在static/js/test/a.js  构建时就会取static/js后的test/a做为模块id
    "jsBase": "static/js",
    //文件md5后缀的分隔符，例如：a.{md5}.js
    "md5Separator": ".",
    //md5码取多少位，
    "md5Size": 8,
    //JS需要构建的配置
    "js": [
        {
            //构建源，跟gulp的source方法保持一致，可以是单个文件/目录*.js/数组
            //以下所有类同
            "source": "static/js/*.js",
            //是否加上md5后缀,默认false
            'md5': true
        },
        {
            "source": ["static/js/test/**/*.js"],
            //用于把source中的所有文件合并到同一个文件，并命名为此配置值
            "concat": "t.js",
            'md5': true,
            //当前配置发布位置，相对于jsDest配置，如果不配置则默认放到jsDest下。
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
            //当有inline模块化js文件时，理否把它依赖的模块一同内嵌进来，默认为false
            "includeModule": true
        }
    ],
    //普通文件构建，可以用于图片拷贝和打md5码
    "files": [
        {
            "source": "static/img/*.*",
            "md5": true,
            "dest": "static/img"
        }
    ]
};

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


//生成压缩JS任务
var jstasks = jmbuild.jsTask(gulp, config, ['jshint'], function(stream){
    return stream.pipe(startFun('js'));
},function(stream){
    return stream.pipe(startFun('js'));
});
//创建任务，用于执行前面创建的任务
gulp.task('minifyJS', jstasks,function (){
    console.log('minifyJS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//一般文件处理
var filetasks = jmbuild.fileTask(gulp, config, [], function(stream){
    return stream.pipe(startFun('file'));
},function(stream){
    return stream.pipe(startFun('file'));
});
gulp.task('cpFile', filetasks,function (){
    console.log('cpFile-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//压缩css
var csstasks = jmbuild.cssTask(gulp, config, ['cpFile'], function(stream){ 
    //此处可以自定加使用一些gulp插件来预处理文件
    //比如cssbase64这个就是使用的gulp-base64来把css听图片换成base64串
    return stream.pipe(cssbase64({extensions:['svg','png',/\.jpg#datauri$/i]}));
},function(stream){
    return stream.pipe(startFun('css'));
});
gulp.task('minifyCSS', csstasks,function (){
    console.log('minifyCSS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});



//html解析主任务
var htmlTasks = jmbuild.htmlTask(gulp, config, ['minifyJS', 'minifyCSS'], function(stream){
    return stream.pipe(startFun('html'));
},function(stream){
    return stream.pipe(startFun('html'));
});
gulp.task('parseHTML', htmlTasks, function (){
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//监听
//gulp.task('watch', function () {
 //   gulp.watch(sources, ['jshint','minifyJS', 'cpFile', 'minifyCSS','parseHTML']);
//});

gulp.task('default', ['jshint','minifyJS', 'cpFile', 'minifyCSS','parseHTML']);


//我是一个测试start
function startFun(msg) {
    var stream = new Stream.Transform({objectMode: true});    
    stream._transform = function(file, unused, callback) {  
        console.log("start Fun["+msg+"]:" + file.path);
        callback(null, file);
      };
    return stream;   
}
//我是一个测试end
function endFun(msg) {
    var stream = new Stream.Transform({objectMode: true});    
    stream._transform = function(file, unused, callback) {  
        console.log("end Fun["+msg+"]:" + file.path);
        callback(null, file);
      };
    return stream;   
}
