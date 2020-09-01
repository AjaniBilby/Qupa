const LLVM = require('./../middle/llvm.js');
const TypeDef = require('./typedef.js');
const Flattern = require('../parser/flattern.js');
const TypeRef = require('./typeRef.js');

const Structure = require('./struct.js');

const Primative = {
	types: require('./../primative/types.js')
};


class Class extends TypeDef {
	constructor (ctx, ast, external = false) {
		super(ctx, ast, external);
		this.structure = new Structure(ctx, ast, external);
		this.terms = [];
		this.linked = false;
		this.size = 0;
	}

	/**
	 *
	 * @param {String} name
	 * @returns {Object}
	 */
	getTerm(name, register) {
		return this.structure.getTerm(name, register);
	}

	parse() {
		this.name = this.ast.tokens[0].tokens;
		this.represent = "%struct." + (
			this.external ? this.name : `${this.name}.${this.ctx.getFileID().toString(36)}`
		);
	}

	link(stack = []) {
		if (stack.indexOf(this) != -1) {
			this.ctx.getFile().throw(
				`Error: Structure ${this.name} contains itself, either directly or indirectly`,
				this.ast.ref.start,
				this.ast.ref.end
			);
			return;
		}
		if (this.linked) {
			return;
		}

		this.linked = true;
		for (let node of this.ast.tokens[3]) {
			let { name, type, ref } = this.structure.processTerm(node);
			this.structure.addTerm(name, type, ref);
		}

		this.size = this.structure.size;
	}

	compile() {
		let frag = new LLVM.Fragment();
		frag.append(this.structure.compile());
		return frag;
	}
}

module.exports = Class;