const File = require('./../component/file.js');
const Project = require('../component/project.js');

const Function = require('./../component/function.js');

const Array_Template = require('./array.js');
const Static_Cast = require('./static_cast.js');
const SizeOf = require('./sizeof.js');
const types = require('./types.js');




/**
 *
 * @param {Project} ctx
 */
function Generate (ctx) {
	let file = new File(ctx, 0, "primative");

	for (let name in types) {
		file.names[name] = types[name];
	}

	file.names.static_cast = new Static_Cast(file);
	file.names.SizeOf = new SizeOf(file);

	file.names.Array = new Array_Template(file);

	ctx.inject(file);
}

module.exports = { Generate, types };