# gulp-jmbuild
**gulp插件，用于WEB前端构建**

## 安装

进入您做为构建工具用的目录

1.首先安装[gulp](http://gulpjs.com/)

```js
$ npm install -g gulp
$ npm install --save-dev gulp
```

2.安装其它依赖[q/gulp-jshint]。

```js
$ npm install q
$ npm install gulp-jshint
```

3.安装gulp-jmbuild

```js
$ npm install gulp-jmbuild
```


## 示例

在构建目录下创建 `gbulpfile.js`
```js
var jshint = require('gulp-jshint');
var Q = require('q');
var gulp = require('gulp');
var path = require('path');

var jmbuild = require('gulp-jmbuild');

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
var jstasks = jmbuild.jsTask(gulp, config, ['jshint']);
//创建任务，用于执行前面创建的任务
gulp.task('minifyJS', jstasks,function (){
    console.log('minifyJS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//一般文件处理
var filetasks = jmbuild.fileTask(gulp, config, []);
gulp.task('cpFile', filetasks,function (){
    console.log('cpFile-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//压缩css
var csstasks = jmbuild.cssTask(gulp, config, ['cpFile']);
gulp.task('minifyCSS', csstasks,function (){
    console.log('minifyCSS-start');
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});

//生成html解析主任务
var htmlTasks = jmbuild.htmlTask(gulp, config, ['minifyJS', 'minifyCSS']);
gulp.task('parseHTML', htmlTasks, function (){
    var deferred = Q.defer();
    deferred.resolve();
    return deferred.promise;
});


gulp.task('default', ['jshint','minifyJS', 'cpFile', 'minifyCSS','parseHTML']);
```