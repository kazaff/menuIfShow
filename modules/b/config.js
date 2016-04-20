var initConfig = require("../../config.js");	//加载配置文件
module.exports = [{
	link_id: 3,	//前端操作编号，用来获取指定操作数据时使用，不允许冲突
	key: "menu_b",	//操作名称key，用来从语言配置中获取显示名称使用
	link_url:initConfig.domain+"b/b.html", 	//对应链接指向的url
	order: 2,	//显示时使用的排序
	isDir: false,	//表示是否未顶级菜单
	dir_id: 1,	//表示所属的顶级菜单，若该操作既不是顶级菜单，也不属于任何顶级菜单，则表示该操作不是菜单，而是页面中的操作链接
	icon: "", //该操作显示时使用的图标
	className: "", 	//该操作显示时使用的class名称
	style: "",	//该操作显示时使用的css样式
	service_id: 2,	//对应后端rest服务的编号
	service_url: "xxxxxx",	//对应后端rest服务的接口地址，这里可能需要根据rest规则替换参数，如/user/{id}
}];
