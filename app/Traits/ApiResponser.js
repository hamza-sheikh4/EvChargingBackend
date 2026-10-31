'use strict'

let o = {}

o.successResponse = function(res, data, statusCode = 200){

	res.status(statusCode).json({
		
		data: data
	})
}

o.errorResponse = function(res, message = 'Server Error', statusCode = 500, code = statusCode){
	console.log("error => ", message)
	res.status(statusCode).json({

		error: message,
		code: code
	})
}

o.showAll = function(res, collection, statusCode = 200){

	res.status(statusCode).json({

		data: collection
	})
}

o.showOne = function(res, model, statusCode = 200){

	res.status(statusCode).json({

		data: model
	})
}

module.exports = o;