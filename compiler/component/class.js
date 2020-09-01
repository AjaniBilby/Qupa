const LLVM = require('./../middle/llvm.js');
const TypeDef = require('./typedef.js');
const Flattern = require('../parser/flattern.js');
const Function = require('./function.js');
const TypeRef = require('./typeRef.js');

const Structure = require('./struct.js');

const Primative = {
	types: require('./../primative/types.js')
};


class Class extends TypeDef {
	constructor (ctx, ast, external = false) {
		super(ctx, ast, external);
		this.structure = new Structure(ctx, ast, external);
		this.names = [];
		this.linked = false;
		this.size = 0;

		this.structure.name = this.name;
		this.structure.represent = this.represent;
	}

	getOwningClass () {
		return this;
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
		this.represent = "%class." + (
			this.external ? this.name : `${this.name}.${this.ctx.getFile().getID().toString(36)}`
		);
	}

	link(stack = []) {
		if (stack.indexOf(this) != -1) {
			this.ctx.getFile().throw(
				`Error: Class ${this.name} contains itself, either directly or indirectly`,
				this.ast.ref.start,
				this.ast.ref.end
			);
			return;
		}
		if (this.linked) {
			return;
		}

		// Ingest structure terms and functions
		this.linked = true;
		for (let node of this.ast.tokens[3]) {
			switch (node.type) {
				case "declare":
					let { name, type, ref } = this.structure.processTerm(node);
					this.structure.addTerm(name, type, ref);
					break;
				case "function":
					let space = new Function(this, node, false, false);
					if (!this.names[space.name]) {
						this.names[space.name] = space;
					} else if (
						!this.names[space.name].merge ||
						!this.names[space.name].merge(space)
					) {
						console.error("Multiple definitions of same namespace");
						console.error("  name :", space.name);
						console.error("   1st :", this.names[space.name].ref.toString());
						console.error("   2nd :", space.ref.toString());
						this.project.markError();
						return false;
					}

					break;
				default:
					throw new Error(`Unexpected class element ${node.type}`)
			}
		}
		this.size = this.structure.size;

		// Check name conflicts
		let names = this.structure.getTermNames()
			.concat(Object.keys(this.names));

		for (let i=0; i<names.length; i++) {
			if (names.indexOf(names[i], i+1) !== -1) {
				this.ctx.getFile().throw(
					`Error: Multiple declarations of name "${names[i]}" in class ${this.name}`,
					this.names[ names[i] ].ref, this.structure.getTermRef(names[i])
				);
			}
		}

		// Resolve function linking
		for (let name in this.names) {
			this.names[name].link();
		}
	}

	compile() {
		let frag = new LLVM.Fragment();
		frag.append(new LLVM.Comment(`Class Group: ${this.name}`));
		frag.append(this.structure.compile());

		for (let name in this.names) {
			frag.merge( this.names[name].compile() );
		}

		return frag;
	}
}

module.exports = Class;