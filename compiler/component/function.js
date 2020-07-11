const { Generator_ID } = require('./generate.js');

const Flattern = require('./../parser/flattern.js');
const TypeDef = require('./typedef.js');
const LLVM = require('../middle/llvm.js');
const Scope = require('./scope.js');


let funcIDGen = new Generator_ID();


class Function {
	constructor (ctx, ast, external = false, abstract = false) {
		this.name = ast.tokens[0].tokens[1].tokens;
		this.ctx = ctx;

		this.ref = ast.ref.start;
		
		this.instances = [];
		this.register(ast, external, abstract);
	}

	getFileID() {
		return this.ctx.getFileID();
	}

	getFile() {
		return this.ctx.getFile();
	}

	register(ast, external = false, abstract = false) {
		this.instances.push(new Function_Instance( this, ast, external, abstract ));
	}

	registerExport() {
		if (this.instances.length > 1) {
			this.getFile().throw(`Link Error: Cannot export function ${this.name} with more than once instances`, this.ref);
			console.error(this.instances);
		}
		this.instances[0].markExport();
	}

	matchSignature(sig) {
		for (let instance of this.instances) {
			if (instance.matchSignature(sig)) {
				return instance;
			}
		}

		return null;
	}

	merge(other){
		for (let instance of this.instances) {
			if (instance.match(other.instances[0])) {
				return false;
			}
		}

		this.instances = this.instances.concat( other.instances );

		return true;
	}

	link() {
		for (let instance of this.instances) {
			instance.link();
		}

		return;
	}

	compile() {
		// let fragment = [`\n; Function Group "${this.name}":`];

		let fragment = new LLVM.Fragment();
		fragment.append(new LLVM.WPad(1));
		fragment.append(new LLVM.Comment(`Function Group "${this.name}":`));

		for (let instance of this.instances) {
			let ir = instance.compile();
			if (ir) {
				fragment.append(ir);
			}
		}

		return fragment;
	}
}

class Function_Instance {
	constructor (ctx, ast, external = false, abstract = false) {
		this.ctx = ctx;
		this.ast = ast;
		this.ref = ast.ref.start;
		this.external = external;
		this.abstract = abstract;

		this.returnType = null;
		this.signature = [];
		this.calls = [];

		this.linked = false;

		this.id = funcIDGen.next();

		this.name = ast.tokens[0].tokens[1].tokens;
		this.represent = external ? `${this.name}` : `${this.name}.${this.ctx.getFileID().toString(36)}.${this.id.toString(36)}`;
	}

	markExport() {
		this.represent = this.name;
	}

	getFileID() {
		return this.ctx.getFileID();
	}

	getFile() {
		return this.ctx.getFile();
	}

	getTypeFrom_DataType(type) {
		let file = this.ctx.ctx;
		let name = null;
		let ptr = false;
		if (type.tokens[0].type == "variable") {
			name = type.tokens[0];
		} else {
			name = type.tokens[0].tokens[1];
			if (type.tokens[0].type == "pointer") {
				ptr = true;
			}
		}

		let ref = file.getType(Flattern.VariableList(name));
		if (ref instanceof TypeDef) {
			return [ptr, ref];
		} else {
			return null;
		}
	}



	link () {
		let file = this.ctx.ctx;
		let head = this.ast.tokens[0];
		let args = head.tokens[2].tokens;

		// Flaten signature types AST into a single array
		let types = [ head.tokens[0] ];
		if (args.length > 0) {
			types = types.concat(args.map((x) => {
				return x[0];
			}));
		}

		for (let type of types){
			let name = null;
			let ptr = 0;
			if (type.tokens[0].type == "variable") {
				name = type.tokens[0];
			} else {
				name = type.tokens[0].tokens[1];
				if (type.tokens[0].type == "pointer") {
					ptr = 1;
				}
			}

			let ref = file.getType(Flattern.VariableList(name));
			if (ref instanceof TypeDef) {
				this.signature.push([ptr, ref]);
			} else {
				if (ref == null) {
					file.throw(
						`Invalid type name "${Flattern.VariableStr(name)}"`,
						name.ref.start, name.ref.end
					);
				} else {
					file.throw(
						`Unexpected data type form "${typeof(ref)}"`,
						name.ref.start, name.ref.end
					);
				}
			}
		}

		this.returnType = this.signature.splice(0, 1)[0];
		this.linked = true;
	}



	match (other) {
		if (!this.linked || !other.linked) {
			return this.matchSignature(other);
		}

		// Match based on raw names
		let a = this.ast.tokens[0].tokens[2].tokens;
		let b = other.ast.tokens[0].tokens[2].tokens;
		if (a.length != a.length) {
			return false;
		}

		for (let i=0; i<a.length; i++) {
			if (a[i][0] != b[i][0] || a[i][1] != b[i][1]) {
				return false;
			}
		}


		return true;
	}
	matchSignature (sig) {
		if (this.signature.length != sig.length) {
			return false;
		}

		for (let i=0; i<sig.length; i++) {
			if (this.signature[i][0] != sig[i][0]) {
				return false;
			}
			let a = this.signature[i][1].represent || this.signature[i][1];
			let b = sig[i][1].represent || sig[i][1];
			if (a != b) {
				return false;
			}
		}

		return true;
	}
	


	compile() {
		if (this.abstract) {
			return null;
		}

		let generator = new Generator_ID(0);
		let args = [];

		let head = this.ast.tokens[0];
		let argReg = [];
		for (let i=0; i<this.signature.length; i++) {
			let regID = generator.next();
			argReg.push({
				id      : regID,
				type    : this.signature[i][1],                  // type
				pointer : this.signature[i][0],                  // pointerLvl
				name    : head.tokens[2].tokens[i][1].tokens,    // name
				ref     : head.tokens[2].tokens[i][0].ref.start  // ln ref
			});

			args.push(new LLVM.Argument(
				new LLVM.Type(
					this.signature[i][1].represent,
					this.signature[i][0],
					head.tokens[2].tokens[i][0].ref.start
				),
				new LLVM.Name(
					regID,
					false,
					head.tokens[2].tokens[i][1].ref.start
				),
				head.tokens[2].tokens[i][0].ref.start,
				head.tokens[2].tokens[i][1].tokens
			));
		}

		let frag = new LLVM.Procedure(
			new LLVM.Type(this.returnType[1].represent, this.returnType[0], head.tokens[0].ref),
			new LLVM.Name(this.represent, true, head.tokens[1].ref),
			args,
			"#1",
			this.external,
			this.ref
		);

		let scope = new Scope(
			this,
			this.returnType[1],
			this.getFile().project.config.caching,
			generator
		);
		let setup = scope.register_Args(argReg);
		if (setup !== null) {
			if (!this.abstract && !this.external) {
				frag.merge(setup);
				frag.merge(scope.compile(this.ast.tokens[1]));
			}
		}

		return frag;
	}
}


module.exports = Function;