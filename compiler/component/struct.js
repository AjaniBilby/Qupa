const LLVM = require('./../middle/llvm.js');
const TypeDef = require('./typedef.js');
const Flattern = require('../parser/flattern.js');
const TypeRef = require('./typeRef.js');

const Primative = {
	types: require('./../primative/types.js')
};


class Struct_Term {
	constructor(name, typeRef, ref) {
		this.name = name;
		this.typeRef = typeRef;
		this.declared = ref;
		this.size = typeRef.pointer > 0 ? 4 : typeRef.type.size;
	}

	toLLVM() {
		return this.typeRef.toLLVM(this.declared);
	}
}


class Structure extends TypeDef {
	constructor (ctx, ast, external = false) {
		super(ctx, ast, external);
		this.terms = [];
		this.linked = false;
	}

	/**
	 *
	 * @param {String} name
	 * @returns {Object}
	 */
	getTerm(name, register) {
		let found = false;
		let i = 0;
		for (; i<this.terms.length && !found; i++) {
			if (this.terms[i].name == name.tokens) {
				found = true;
				break;
			}
		}
		if (!found) {
			return null;
		}

		let preamble = new LLVM.Fragment();
		let signature = `.${i}`;
		let instruction = new LLVM.GEP(
			register.type.duplicate().offsetPointer(-1, register.declared).toLLVM(),
			register.toLLVM(),
			[
				new LLVM.Argument(
					Primative.types.i32.toLLVM(),
					new LLVM.Constant("0", name.ref.start),
					name.ref.start
				),
				new LLVM.Argument(
					new LLVM.Type("i32", 0, name.ref.start),
					new LLVM.Constant(i.toString(), name.ref.start)
				)
			],
			name.ref.start
		);

		return { preamble, instruction, signature, typeRef: this.terms[i].typeRef };
	}

	/**
	 * Check if the name is in use
	 * @param {String} name
	 */
	hasTerm(name) {
		for (let term of this.terms) {
			if (term.name == name) {
				return true;
			}
		}

		return false;
	}

	/**
	 *
	 * @param {String} name
	 * @param {TypeRef} type
	 * @param {BNF_Reference} ref
	 * @returns {Struct_Term?}
	 */
	addTerm(name, type, ref) {
		if (this.hasTerm(name)) {
			this.ctx.getFile().throw(
				`Error: Multiple use of term ${name} in struct`,
				this.terms[name].declared,
				node.ref.end
			);
			return null;
		}

		let term = new Struct_Term(name, type, ref);
		this.size += term.size;
		this.terms.push(term);

		return term;
	}

	processTerm(node) {
		let typeNode = node.tokens[0];
		let typeRef = this.ctx.getType(Flattern.DataTypeList(typeNode));
		if (typeRef === null) {
			this.ctx.getFile().throw(
				`Error: Unknown type ${Flattern.DataTypeStr(typeNode)}`,
				typeNode.ref.start,
				typeNode.ref.end
			);
			return;
		}
		if (!typeRef.type.linked) {
			type.link([this, ...stack]);
		}

		return {
			name: node.tokens[1].tokens,
			type: new TypeRef(typeNode.tokens[0], typeRef.type),
			ref: node.ref.start
		};
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
		this.size = 0;
		for (let node of this.ast.tokens[1].tokens) {
			let { name, type, ref } = this.processTerm(node);

			if ( this.addTerm(name, type, ref) === null) {
				return null;
			}
		}
	}

	compile() {
		let types = [];
		for (let name in this.terms) {
			types.push(this.terms[name].toLLVM());
		}

		return new LLVM.Struct(
			new LLVM.Name(this.represent, false, this.ref),
			types,
			this.ref
		);
	}
}

module.exports = Structure;