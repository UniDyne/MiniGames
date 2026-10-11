var http = require("http"),
	url = require("url"),
	path = require("path"),
	fs = require("fs")
	port = process.argv[2] || 8888;

// this could be stored in a json file instead
var mimetypes = {
	css: "text/css",
	gif: "image/gif",
	html: "text/html",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	js: "text/javascript",
	json: "application/json",
	png: "image/png",
	txt: "text/plain",
	xml: "text/xml"
};

function getMimeType(filename) {
	var ext = path.extname(filename).replace(/^\./,'');
	return mimetypes.hasOwnProperty(ext) ? mimetypes[ext] : "application/octet-stream";
}

function sendResponseCode(response, code, data) {
	var header = {"Content-Type": "text/plain"}, message;
	
	switch(code) {
		case 403:
			message = "403 Forbidden\n";
			break;
		case 404:
			message = "404 Not Found\n";
			break;
		case 405:
			message = "405 Method Not Allowed\n";
			break;
		case 500:
			message = "500 Internal Server Error\n" + data + "\n";
			break;
		default:
			message = "500 Internal Server Error\nUnimplemented response code '"+code+"'\n";
			code = 500;
			break;
	}
	
	response.writeHead(code, header);
	response.write(message);
	response.end();
	return;
}

http.createServer(function(request, response) {
	
	// normalize path first to prevent directory traversal
	var uri = path.normalize(url.parse(request.url).pathname),
		filename = path.join(process.cwd(), uri);
	
	// only supporting GET and POST
	// POST is in order to support dummy form submits
	if(request.method != "GET" && request.method != "POST")
		return sendResponseCode(response, 405);
	
	fs.exists(filename, function(exists) {
		// return 404 when file does not exist
		if(!exists) return sendResponseCode(response, 404);
		
		var stat = fs.statSync(filename);
		
		// if this is a directory, try index.html
		if (stat.isDirectory()) {
			filename = path.join(filename, 'index.html');
			exists = fs.existsSync(filename);
			
			// 403 forbidden if no index
			if(!exists) return sendResponseCode(response, 403);
			
			// update stat
			stat = fs.statSync(filename);
		}
		
		
		fs.readFile(filename, "binary", function(err, file) {
			// 500 if we can't read the file
			if(err) return sendResponseCode(response, 500, err);
			
			// otherwise, send contents
			response.writeHead(200, {"Content-Type": getMimeType(filename), "Content-Length": stat.size});
			response.write(file, "binary");
			response.end();
		});
	});
}).listen(parseInt(port, 10));

console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");