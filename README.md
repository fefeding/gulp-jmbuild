# gulp-jmbuild
**gulp插件，用于WEB前端构建**

## 安装

进入您做为构建工具用的目录

**1.首先安装[gulp](http://gulpjs.com/)**

```js
$ npm install -g gulp
$ npm install --save-dev gulp
```

**2.安装其它依赖[q/gulp-jshint]。**

```js
$ npm install q
$ npm install gulp-jshint
```

**3.安装gulp-jmbuild**

```js
$ npm install gulp-jmbuild
```


## 示例

**在构建目录下创建 `gbulpfile.js`**

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

## 运行

在gulpfile.js目录下执行如下命令

```js
$ gulp
```


## 用法

 !!#ff0000 html构建时路径处理说明：如果以 !!#ff00ff .或/!! 开头，则它相对的是构建配置  !!#ff00ff dest !! 目录;
如果不是，则当为 .js 就会以jsDest为路径，.css就会以cssDest配置路径来计算绝对路径。
如果以上条件都不符合，则以当前html文件目录为当前路径来计算。!! 

**1.__pkg/__uri函数**

当在html中使用__pkg('xxx')/__uri('XXX')时，构建时会被自动替换成对应文件路径，如果有配置md5会自动带上md5码(配置在config的配置中)。
例如：
```html
<link rel="stylesheet" href="__uri('static/css/style.css')" />	
<script src="__uri(static/js/a.js)"></script>
var a=__pkg('/static/js/a.js');
var t=__pkg('test/t.js');
```
构建后：
```html
<link rel="stylesheet" href="static/css/style.95cc4059.css" />	
<script src="static/js/a.49ea7d65.js"></script>
var a="/static/js/a.49ea7d65.js";
var t="test/t.fbdd9f3d.js";
```

**2.__inline函数**

此函数为把对应的文件内容（构建后的）内联到当前html中。

 !!#ff0000 注：如果当前html构建配置中有指定"includeModule": true  则当inline一个模块化js文件时，会同时把它所有依赖js一起内联进来。!! 

例如：
```html
<style>
	__inline('/static/css/style.css')
</style>
<script>
__inline('test/t.js', 'a.js');
</script>
```
构建后：
```html
<style>
	body,html{margin:0;padding:0}...略
</style>
<script>
define("a",[],function(n,a,i){a.run=function(){alert("i am a")}});
define("b",["./a"],function(n,i,a){var f=n("./a");i.init=function(){f.run("b")}});
define("test/c",["../b"],function(i,n,t){var b=i("../b");n.init=function(){b.init("b")}});
define("test/dir/d",["../../b"],function(i,n,t){var d=i("../../b");n.init=function(){d.init("d")}});
</script>
```

**3.css中的import语法**

当构建css文件时，会把@import url("./base.css?__inline");指定的文件合并到当前css中。
