
console.log('start build');

var jshint = require('gulp-jshint');
var Q = require('q');
var gulp = require('gulp');
var path = require('path');
var Stream = require('stream');

var cssbase64 = require('gulp-base64');
var runSequence = require('gulp-run-sequence');
var sourcemaps = require('gulp-sourcemaps');

var jmbuild = require('../../index.js');//使用npm安装后请用: require('gulp-jmbuild');

//配置文件
var config = {
    "debug": false,//如果是true,则不全合并和压缩文件，也不会打md5码
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
    //如果js文件配置中有配置base，则用文件配置中的base为准 
    "jsBase": "static/js",
    //文件md5后缀的分隔符，例如：a.{md5}.js
    "separator": ".",
    //md5码取多少位，
    "md5Size": 8,
    //路径映射，如果配置了映射，构建时，会把配匹的url替换成target
    "urlMaps": [
        {match:/^\/mqq\/v3\//, target: "//qian-img.tenpay.com/mqq/v3/"}
    ],
    //JS需要构建的配置
    "js": [
        {
            //构建源，跟gulp的source方法保持一致，可以是单个文件/目录*.js/数组
            //以下所有类同
            "source": "static/js/*.js",
            //是否加上md5后缀,默认false
            'md5': true,
            //名称扩展，会直接加到文件名后缀前,例如：a.324242.lc.js
            "expand": 'lc'
        },
        {
            "source": ["static/js/test/**/*.js"],
            //用于把source中的所有文件合并到同一个文件，并命名为此配置值
            "concat": "t.js",
            'md5': true,
            //当前配置发布位置，相对于jsDest配置，如果不配置则默认放到jsDest下。
            "dest": 'test',
            //这里要做用主要是会在模块id中加上test/**做为路径，并在debug时，单独文件构建会放到test/**下面，而不是合到t.js
            "base": 'static/js'
            //部署相关配置，这里自定义属性，可在debug时用到，跟插件无关
            //,
            //"deployBase": 'xx.com/static/pc/syb_bbs/',
            //'deployDest': '/data/web/xx.com/static/pc/syb_bbs'
        },
        {
            "source": "static/js/test2/**/*.js",           
            'md5': true,
            //当前配置发布位置，相对于jsDest配置，如果不配置则默认放到jsDest下。
            "dest": 'test2',
            //如果有指定base,则会把文件构建到dest目录，然后去除base后目录路径不变，比如此例就会放到test2/**下面
            "base": 'static/js'
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
            "dest": "static/img",
            "maxSize": 100,//限制文件大小，单位KB
            //false表示以流的方式处理，否则表示直接读取到contents中
            "buffer": true
        }
    ]
};

//如果指定了debug参数
if(Array.prototype.indexOf.call(process.argv, '-debug') > 0) {
    config.debug = true;
}

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
    //console.log('jshint:');
    return gulp.src(sources, {cwd:config.root})
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});


//生成压缩JS任务
var jstasks = jmbuild.jsTask(gulp, config, ['jshint'], function(stream){
    return stream.pipe(sourcemaps.init());
},function(stream){
    return stream.pipe(sourcemaps.write('./'));
});
//创建任务，用于执行前面创建的任务
gulp.task('build-js', jstasks,function (){
    console.log('js-start');
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
gulp.task('build-file', filetasks,function (){
    console.log('file-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//压缩css,依赖file拷贝
var csstasks = jmbuild.cssTask(gulp, config, ['build-file'], function(stream){ 
    //此处可以自定加使用一些gulp插件来预处理文件
    //比如cssbase64这个就是使用的gulp-base64来把css听图片换成base64串
    //return stream.pipe(cssbase64({extensions:['svg','png',/\.jpg#datauri$/i]}));
    return stream.pipe(sourcemaps.init());
},function(stream){
    return stream.pipe(sourcemaps.write('./'));
});
//构建css任务
gulp.task('build-style', csstasks,function (){
    console.log('minifyCSS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});



//html解析主任务
var htmlTasks = jmbuild.htmlTask(gulp, config, ['build-js', 'build-style'], function(stream){
    return stream.pipe(startFun('html'));
},function(stream){
    return stream.pipe(startFun('html'));
});
gulp.task('build-html', htmlTasks, function (){
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

var tasks = ['build-js','build-html'];
//如果是debug模式，则启用监听
if(config.debug) {
    //监听
    gulp.task('watch', tasks.slice(0), function () {        
        jmbuild.watch(gulp, config, function(task, source, evt){
            //执行文件改变后，重新构建
            runSequence(task.name, function(){
                console.log(task);
                //这里可以部署等操作，
                /*
                if(!source.deployDest) {
                    console.log('无法部署当前文件，请确保已正确配置部署路径。');
                    return false;
                }
                var deployName = path.basename(task.dest);
                //如果存在部署基础路径，则截取后续
                if(source.deployBase) {
                    task.dest = task.dest.replace(/\\/g,'/');
                    var index = task.dest.indexOf(source.deployBase);                    
                    if(index >= 0) {
                        deployName = task.dest.substring(index + source.deployBase.length);
                    }
                }
                var to = source.deployDest + '/' + deployName;
                
                var req = request.post('http://xx.qq.com/static/upload/receiver.php', {
                    formData: {
                        to: to,
                        file: fs.createReadStream(task.dest)
                      }
                },function(err, rsp, body) {
                    if (err) {
                        console.log('Error!');
                      } else {
                        console.log('send file success:' + to);
                      }
                });   */             
            });
        });

        setTimeout(function(){
           console.log('watching ...'); 
        },100);
        
    }); 
    tasks.push('watch');    
}

gulp.task('default', tasks);  


//下面二个函数只是测试，你可以在里面做你想要的预处理或结束后处理事情
//我是一个测试start
function startFun(msg) {
    var stream = new Stream.Transform({objectMode: true});    
    stream._transform = function(file, unused, callback) {  
        //console.log("start Fun["+msg+"]:" + file.path);
        callback(null, file);
      };
    return stream;   
}
//我是一个测试end
function endFun(msg) {
    var stream = new Stream.Transform({objectMode: true});    
    stream._transform = function(file, unused, callback) {  
        //console.log("end Fun["+msg+"]:" + file.path);
        callback(null, file);
      };
    return stream;   
}
