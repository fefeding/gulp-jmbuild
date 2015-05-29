var path = require('path');
var gulp = require('gulp');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var md5 = require('gulp-md5');

var transport = require('./transport');

module.exports = function(s, config, callback) {
	var target = path.resolve(config.cwd, s.target || config.target);
	var stream = gulp.src(s.source || s, {cwd:config.cwd}) 
         .pipe(transport({
                "base": path.resolve(config.cwd, config.base),
                "type": 'js'
            })).pipe(gulp.dest(target));         
         
     if(s.concat) stream = stream.pipe(concat(s.concat)).pipe(gulp.dest(target));
     
     if(s.rename) stream = stream.pipe(rename(s.rename)).pipe(gulp.dest(target));
     if(s.md5) stream = stream.pipe(md5());
     stream.pipe(uglify()).pipe(gulp.dest(target));
     callback && callback();
}