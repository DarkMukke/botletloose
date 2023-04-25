module.exports = {
    apps : [{
        name   : "bll",
        script : "./index.js",
        watch  : true,
        ignore_watch : ["[\/\\]\./", "node_modules", "deploy-commands.js"],
        time : true,
        log_date_format : "YYYY-MM-DD HH:mm Z"
    }]
}