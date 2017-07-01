var walk = require("walkdir");
var p = require("path");
var fs = require("fs");
var _ = require("lodash");
var crypto = require('crypto');

var Webpack = require("webpack");
var HtmlWebpackPlugin = require("html-webpack-plugin");

var oldConfig = null;	// 避免-w模式下死循环编译问题

// 目标监控目录
var watchDir = process.argv[process.argv.length-1];
if(watchDir === 'webpack.config.dev.js'){
	watchDir = '';
}

var plugins = [
	new Webpack.BannerPlugin("by kazaff"),
	function(){
		this.plugin("watch-run", function(compX, callback){

			// 获取当前所有需要处理的config文件位置
			var paths  = [];
			walk.sync("./modules/", function(path, stat){
				if(p.basename(path) === "config.js"){
					paths.push(path);
				}
			});

			// 检查是不是每个模块都有配置文件
			var moduleCount = 0;
			walk.sync("./modules/", {no_recurse: true}, function(path, stat){
				var stat = fs.statSync(path);
				if(stat.isDirectory()){
					moduleCount++;
				}
			});
			if(moduleCount !== paths.length){
				throw "模块数和config数不一致";
			}

			// 合并所有发现的config.js
			var configs = [];
			_(paths).forEach(function(path){
				delete require.cache[path];	//清除缓存
				configs.push(require(path));
			});
			configs = _.flatten(configs);

			// 检查配置文件中，link_id是否存在冲突
			var tmpConfigs = _.uniqBy(configs, "link_id");
			if(configs.length !== tmpConfigs.length){
				var conflictConfigs = _.differenceWith(configs, tmpConfigs, _.isEqual);
				console.log("∨∨∨∨∨∨∨∨∨∨∨∨∨∨");
				console.error(conflictConfigs);	// todo 未知原因导致这里输出两次，怀疑是webpack处理异常机制导致
				console.log("∧∧∧∧∧∧∧∧∧∧∧∧∧∧");
				throw "项目配置文件中link_id存在冲突";
			}
			tmpConfigs = null;

			_(configs).forEach(function(target){
				if(!target.link_url)
					return;

				if(target.link_url.indexOf('?')>=0){
					target.link_url += '&';
				}else{
					target.link_url += '?';
				}
			});

			// 根据内容生成总config.js
			var jsonConfigs = crypto.createHash('md5').update(JSON.stringify(configs)).digest("hex");
			if(oldConfig !== jsonConfigs){	// 避免-w模式下死循环编译问题
				fs.writeFileSync("./tmp/config.js", "module.exports="+JSON.stringify(configs));
				oldConfig = jsonConfigs;
			}

			return callback && callback();
		});
	},
	new HtmlWebpackPlugin({
		filename: "index.html",
		template: "./index.html",
		excludeChunks: ['TempConfig']	// 排除根文件夹中的config.js文件
	})
];

configs = [];
walk.sync("./modules/", function(path, stat){
	if(p.basename(path) === "config.js"){
		configs.push(path);
	}
});

// 自动将编译好的boot文件注入到所有模块的html文件中
walk.sync("./modules/" + watchDir, function(path, stat){
	if(p.extname(path) === ".html"){
		plugins.push(new HtmlWebpackPlugin({
			filename: p.relative(p.resolve("."), path),
			template: path,
			excludeChunks: ['TempConfig']	// 排除每个模块文件夹中的config.js文件
		}));
	}
});

module.exports = {
	devServer: {
		port: 9000,
		watchOptions: {
			aggregateTimeout: 3000,
	  	poll: 1000,
			ignored: [
				"**/build/**",
				"**/dist/**",
				"**/node_modules/**",
				"**/.git/**",
				"**/assets/**",
				"**/.idea/**",
				"**/.settings/**",
				"**/mock/**",
				"**/tests/**",
				"**/tmp/**",
			]
		}
	},
	entry: {
		Boot: './boot.js',
		TempConfig: configs,	// 目的是让webpack能监听config.js文件的变更，否则无法触发自动编译
		Another: './init.js',
	},
	output: {
		path: p.resolve(__dirname, './dist/'),
		filename: "[name].js"
	},
	module:{
		rules: [
			{
				test: /\.js$/,
				exclude: /(node_modules|assets|\.git|tests|mock|build)/,
				use: {
		      loader: 'babel-loader?cacheDirectory',
		      options: {
		        presets: ['es2015'],
		        plugins: ['transform-runtime']
		      }
		    }
			}
		]
	},
	resolve: {
		extensions: ['.js']
	},
	plugins: plugins
};
