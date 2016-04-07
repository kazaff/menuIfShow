//获取当前所有需要处理的config文件位置
var walk = require("walkdir");
var p = require("path");
var paths  = [];
walk.sync("./modules/", function(path, stat){
	if(p.basename(path) === "config.js"){
		paths.push(path);
	}
});

//合并所有发现的config.js
var _ = require("lodash");
var configs = [];
_(paths).forEach(function(path){
	configs.push(require(path));
});
configs = _.flatten(configs);

//检查配置文件中，link_id是否存在冲突
var tmpConfigs = _.uniqBy(configs, "link_id");
if(configs.length !== tmpConfigs.length){
	var conflictConfigs = _.differenceWith(configs, tmpConfigs, _.isEqual);
	console.log("∨∨∨∨∨∨∨∨∨∨∨∨∨∨");
	console.error(conflictConfigs);	//todo 未知原因导致这里输出两次，怀疑是webpack处理异常机制导致
	console.log("∧∧∧∧∧∧∧∧∧∧∧∧∧∧");
	throw "项目配置文件中link_id存在冲突";
}
tmpConfigs = null;

//根据内容生成总config.js
var fs = require("fs");
fs.writeFileSync("./config.js", "module.exports="+JSON.stringify(configs));

var Webpack = require("webpack");
var HtmlWebpackPlugin = require("html-webpack-plugin");
//自动将编译好的boot文件注入到所有模块的html文件中
paths  = [];
walk.sync("./modules/", function(path, stat){
	if(p.extname(path) === ".html"){
		paths.push(path);
	}
});
var plugins = [
	new Webpack.BannerPlugin("by kazaff"),
	function(){
		this.plugin("done", function(stats){
			//清理工作
			fs.unlinkSync("./config.js");
		});
	},
	new HtmlWebpackPlugin({
		filename: "index.html",
		template: "./index.html"
	})
];
_(paths).forEach(function(path){
	plugins.push(new HtmlWebpackPlugin({
		filename: p.relative(p.resolve("."), path),
		template: path,
	}));
});

module.exports = {
	entry: {
		Boot: './boot.js',
	},
	output: {
		path: "build",
		filename: "[name]-[chunkhash].js"
	},
	module:{
		loaders: [
			{
				test: /\.js$/,
				loader: "babel?presets[]=es2015,plugins[]=transform-runtime",
				exclude: [/node_modules/]
			}
		]
	},
	resolve: {
		extensions: ['', '.js']
	},
	plugins: plugins
}
