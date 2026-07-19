(function() {
	//#region node_modules/@vue/shared/dist/shared.esm-bundler.js
	/**
	* @vue/shared v3.5.40
	* (c) 2018-present Yuxi (Evan) You and Vue contributors
	* @license MIT
	**/
	// @__NO_SIDE_EFFECTS__
	function makeMap(str) {
		const map = /* @__PURE__ */ Object.create(null);
		for (const key of str.split(",")) map[key] = 1;
		return (val) => val in map;
	}
	var EMPTY_OBJ = {};
	var EMPTY_ARR = [];
	var NOOP = () => {};
	var NO = () => false;
	var isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && (key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
	var isModelListener = (key) => key.startsWith("onUpdate:");
	var extend = Object.assign;
	var remove = (arr, el) => {
		const i = arr.indexOf(el);
		if (i > -1) arr.splice(i, 1);
	};
	var hasOwnProperty$1 = Object.prototype.hasOwnProperty;
	var hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
	var isArray = Array.isArray;
	var isMap = (val) => toTypeString(val) === "[object Map]";
	var isSet = (val) => toTypeString(val) === "[object Set]";
	var isDate = (val) => toTypeString(val) === "[object Date]";
	var isFunction = (val) => typeof val === "function";
	var isString = (val) => typeof val === "string";
	var isSymbol = (val) => typeof val === "symbol";
	var isObject = (val) => val !== null && typeof val === "object";
	var isPromise = (val) => {
		return (isObject(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
	};
	var objectToString = Object.prototype.toString;
	var toTypeString = (value) => objectToString.call(value);
	var toRawType = (value) => {
		return toTypeString(value).slice(8, -1);
	};
	var isPlainObject = (val) => toTypeString(val) === "[object Object]";
	var isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
	var isReservedProp = /* @__PURE__ */ makeMap(",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted");
	var cacheStringFunction = (fn) => {
		const cache = /* @__PURE__ */ Object.create(null);
		return ((str) => {
			return cache[str] || (cache[str] = fn(str));
		});
	};
	var camelizeRE = /-\w/g;
	var camelize = cacheStringFunction((str) => {
		return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
	});
	var hyphenateRE = /\B([A-Z])/g;
	var hyphenate = cacheStringFunction((str) => str.replace(hyphenateRE, "-$1").toLowerCase());
	var capitalize = cacheStringFunction((str) => {
		return str.charAt(0).toUpperCase() + str.slice(1);
	});
	var toHandlerKey = cacheStringFunction((str) => {
		return str ? `on${capitalize(str)}` : ``;
	});
	var hasChanged = (value, oldValue) => !Object.is(value, oldValue);
	var invokeArrayFns = (fns, ...arg) => {
		for (let i = 0; i < fns.length; i++) fns[i](...arg);
	};
	var def = (obj, key, value, writable = false) => {
		Object.defineProperty(obj, key, {
			configurable: true,
			enumerable: false,
			writable,
			value
		});
	};
	var looseToNumber = (val) => {
		const n = parseFloat(val);
		return isNaN(n) ? val : n;
	};
	var _globalThis;
	var getGlobalThis = () => {
		return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
	};
	function normalizeStyle(value) {
		if (isArray(value)) {
			const res = {};
			for (let i = 0; i < value.length; i++) {
				const item = value[i];
				const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
				if (normalized) for (const key in normalized) res[key] = normalized[key];
			}
			return res;
		} else if (isString(value) || isObject(value)) return value;
	}
	var listDelimiterRE = /;(?![^(]*\))/g;
	var propertyDelimiterRE = /:([^]+)/;
	var styleCommentRE = /\/\*[^]*?\*\//g;
	function parseStringStyle(cssText) {
		const ret = {};
		cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
			if (item) {
				const tmp = item.split(propertyDelimiterRE);
				tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
			}
		});
		return ret;
	}
	function normalizeClass(value) {
		let res = "";
		if (isString(value)) res = value;
		else if (isArray(value)) for (let i = 0; i < value.length; i++) {
			const normalized = normalizeClass(value[i]);
			if (normalized) res += normalized + " ";
		}
		else if (isObject(value)) {
			for (const name in value) if (value[name]) res += name + " ";
		}
		return res.trim();
	}
	var specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
	var isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
	specialBooleanAttrs + "";
	function includeBooleanAttr(value) {
		return !!value || value === "";
	}
	function looseCompareArrays(a, b) {
		if (a.length !== b.length) return false;
		let equal = true;
		for (let i = 0; equal && i < a.length; i++) equal = looseEqual(a[i], b[i]);
		return equal;
	}
	function looseEqual(a, b) {
		if (a === b) return true;
		let aValidType = isDate(a);
		let bValidType = isDate(b);
		if (aValidType || bValidType) return aValidType && bValidType ? a.getTime() === b.getTime() : false;
		aValidType = isSymbol(a);
		bValidType = isSymbol(b);
		if (aValidType || bValidType) return a === b;
		aValidType = isArray(a);
		bValidType = isArray(b);
		if (aValidType || bValidType) return aValidType && bValidType ? looseCompareArrays(a, b) : false;
		aValidType = isObject(a);
		bValidType = isObject(b);
		if (aValidType || bValidType) {
			if (!aValidType || !bValidType) return false;
			if (Object.keys(a).length !== Object.keys(b).length) return false;
			for (const key in a) {
				const aHasKey = a.hasOwnProperty(key);
				const bHasKey = b.hasOwnProperty(key);
				if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) return false;
			}
		}
		return String(a) === String(b);
	}
	function looseIndexOf(arr, val) {
		return arr.findIndex((item) => looseEqual(item, val));
	}
	var isRef$1 = (val) => {
		return !!(val && val["__v_isRef"] === true);
	};
	var toDisplayString = (val) => {
		return isString(val) ? val : val == null ? "" : isArray(val) || isObject(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
	};
	var replacer = (_key, val) => {
		if (isRef$1(val)) return replacer(_key, val.value);
		else if (isMap(val)) return { [`Map(${val.size})`]: [...val.entries()].reduce((entries, [key, val2], i) => {
			entries[stringifySymbol(key, i) + " =>"] = val2;
			return entries;
		}, {}) };
		else if (isSet(val)) return { [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v)) };
		else if (isSymbol(val)) return stringifySymbol(val);
		else if (isObject(val) && !isArray(val) && !isPlainObject(val)) return String(val);
		return val;
	};
	var stringifySymbol = (v, i = "") => {
		var _a;
		return isSymbol(v) ? `Symbol(${(_a = v.description) != null ? _a : i})` : v;
	};
	//#endregion
	//#region node_modules/@vue/reactivity/dist/reactivity.esm-bundler.js
	/**
	* @vue/reactivity v3.5.40
	* (c) 2018-present Yuxi (Evan) You and Vue contributors
	* @license MIT
	**/
	var activeEffectScope;
	var EffectScope = class {
		constructor(detached = false) {
			this.detached = detached;
			/**
			* @internal
			*/
			this._active = true;
			/**
			* @internal track `on` calls, allow `on` call multiple times
			*/
			this._on = 0;
			/**
			* @internal
			*/
			this.effects = [];
			/**
			* @internal
			*/
			this.cleanups = [];
			this._isPaused = false;
			this._warnOnRun = true;
			this.__v_skip = true;
			if (!detached && activeEffectScope) if (activeEffectScope.active) {
				this.parent = activeEffectScope;
				this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(this) - 1;
			} else {
				this._active = false;
				this._warnOnRun = false;
			}
		}
		get active() {
			return this._active;
		}
		pause() {
			if (this._active) {
				this._isPaused = true;
				let i, l;
				if (this.scopes) {
					const scopes = this.scopes.slice();
					for (i = 0, l = scopes.length; i < l; i++) scopes[i].pause();
				}
				for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].pause();
			}
		}
		/**
		* Resumes the effect scope, including all child scopes and effects.
		*/
		resume() {
			if (this._active) {
				if (this._isPaused) {
					this._isPaused = false;
					let i, l;
					if (this.scopes) {
						const scopes = this.scopes.slice();
						for (i = 0, l = scopes.length; i < l; i++) scopes[i].resume();
					}
					const effects = this.effects.slice();
					for (i = 0, l = effects.length; i < l; i++) effects[i].resume();
				}
			}
		}
		run(fn) {
			if (this._active) {
				const currentEffectScope = activeEffectScope;
				try {
					activeEffectScope = this;
					return fn();
				} finally {
					activeEffectScope = currentEffectScope;
				}
			}
		}
		/**
		* This should only be called on non-detached scopes
		* @internal
		*/
		on() {
			if (++this._on === 1) {
				this.prevScope = activeEffectScope;
				activeEffectScope = this;
			}
		}
		/**
		* This should only be called on non-detached scopes
		* @internal
		*/
		off() {
			if (this._on > 0 && --this._on === 0) {
				if (activeEffectScope === this) activeEffectScope = this.prevScope;
				else {
					let current = activeEffectScope;
					while (current) {
						if (current.prevScope === this) {
							current.prevScope = this.prevScope;
							break;
						}
						current = current.prevScope;
					}
				}
				this.prevScope = void 0;
			}
		}
		stop(fromParent) {
			if (this._active) {
				this._active = false;
				let i, l;
				for (i = 0, l = this.effects.length; i < l; i++) this.effects[i].stop();
				this.effects.length = 0;
				for (i = 0, l = this.cleanups.length; i < l; i++) this.cleanups[i]();
				this.cleanups.length = 0;
				if (this.scopes) {
					const scopes = this.scopes.slice();
					for (i = 0, l = scopes.length; i < l; i++) scopes[i].stop(true);
					this.scopes.length = 0;
				}
				if (!this.detached && this.parent && !fromParent) {
					const last = this.parent.scopes.pop();
					if (last && last !== this) {
						this.parent.scopes[this.index] = last;
						last.index = this.index;
					}
				}
				this.parent = void 0;
			}
		}
	};
	function getCurrentScope() {
		return activeEffectScope;
	}
	var activeSub;
	var pausedQueueEffects = /* @__PURE__ */ new WeakSet();
	var ReactiveEffect = class {
		constructor(fn) {
			this.fn = fn;
			/**
			* @internal
			*/
			this.deps = void 0;
			/**
			* @internal
			*/
			this.depsTail = void 0;
			/**
			* @internal
			*/
			this.flags = 5;
			/**
			* @internal
			*/
			this.next = void 0;
			/**
			* @internal
			*/
			this.cleanup = void 0;
			this.scheduler = void 0;
			if (activeEffectScope) if (activeEffectScope.active) activeEffectScope.effects.push(this);
			else this.flags &= -2;
		}
		pause() {
			this.flags |= 64;
		}
		resume() {
			if (this.flags & 64) {
				this.flags &= -65;
				if (pausedQueueEffects.has(this)) {
					pausedQueueEffects.delete(this);
					this.trigger();
				}
			}
		}
		/**
		* @internal
		*/
		notify() {
			if (this.flags & 2 && !(this.flags & 32)) return;
			if (!(this.flags & 8)) batch(this);
		}
		run() {
			if (!(this.flags & 1)) return this.fn();
			this.flags |= 2;
			cleanupEffect(this);
			prepareDeps(this);
			const prevEffect = activeSub;
			const prevShouldTrack = shouldTrack;
			activeSub = this;
			shouldTrack = true;
			try {
				return this.fn();
			} finally {
				cleanupDeps(this);
				activeSub = prevEffect;
				shouldTrack = prevShouldTrack;
				this.flags &= -3;
			}
		}
		stop() {
			if (this.flags & 1) {
				for (let link = this.deps; link; link = link.nextDep) removeSub(link);
				this.deps = this.depsTail = void 0;
				cleanupEffect(this);
				this.onStop && this.onStop();
				this.flags &= -2;
			}
		}
		trigger() {
			if (this.flags & 64) pausedQueueEffects.add(this);
			else if (this.scheduler) this.scheduler();
			else this.runIfDirty();
		}
		/**
		* @internal
		*/
		runIfDirty() {
			if (isDirty(this)) this.run();
		}
		get dirty() {
			return isDirty(this);
		}
	};
	var batchDepth = 0;
	var batchedSub;
	var batchedComputed;
	function batch(sub, isComputed = false) {
		sub.flags |= 8;
		if (isComputed) {
			sub.next = batchedComputed;
			batchedComputed = sub;
			return;
		}
		sub.next = batchedSub;
		batchedSub = sub;
	}
	function startBatch() {
		batchDepth++;
	}
	function endBatch() {
		if (--batchDepth > 0) return;
		if (batchedComputed) {
			let e = batchedComputed;
			batchedComputed = void 0;
			while (e) {
				const next = e.next;
				e.next = void 0;
				e.flags &= -9;
				e = next;
			}
		}
		let error;
		while (batchedSub) {
			let e = batchedSub;
			batchedSub = void 0;
			while (e) {
				const next = e.next;
				e.next = void 0;
				e.flags &= -9;
				if (e.flags & 1) try {
					e.trigger();
				} catch (err) {
					if (!error) error = err;
				}
				e = next;
			}
		}
		if (error) throw error;
	}
	function prepareDeps(sub) {
		for (let link = sub.deps; link; link = link.nextDep) {
			link.version = -1;
			link.prevActiveLink = link.dep.activeLink;
			link.dep.activeLink = link;
		}
	}
	function cleanupDeps(sub) {
		let head;
		let tail = sub.depsTail;
		let link = tail;
		while (link) {
			const prev = link.prevDep;
			if (link.version === -1) {
				if (link === tail) tail = prev;
				removeSub(link);
				removeDep(link);
			} else head = link;
			link.dep.activeLink = link.prevActiveLink;
			link.prevActiveLink = void 0;
			link = prev;
		}
		sub.deps = head;
		sub.depsTail = tail;
	}
	function isDirty(sub) {
		for (let link = sub.deps; link; link = link.nextDep) if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) return true;
		if (sub._dirty) return true;
		return false;
	}
	function refreshComputed(computed) {
		if (computed.flags & 4 && !(computed.flags & 16)) return;
		computed.flags &= -17;
		if (computed.globalVersion === globalVersion) return;
		computed.globalVersion = globalVersion;
		if (!computed.isSSR && computed.flags & 128 && (!computed.deps && !computed._dirty || !isDirty(computed))) return;
		computed.flags |= 2;
		const dep = computed.dep;
		const prevSub = activeSub;
		const prevShouldTrack = shouldTrack;
		activeSub = computed;
		shouldTrack = true;
		try {
			prepareDeps(computed);
			const value = computed.fn(computed._value);
			if (dep.version === 0 || hasChanged(value, computed._value)) {
				computed.flags |= 128;
				computed._value = value;
				dep.version++;
			}
		} catch (err) {
			dep.version++;
			throw err;
		} finally {
			activeSub = prevSub;
			shouldTrack = prevShouldTrack;
			cleanupDeps(computed);
			computed.flags &= -3;
		}
	}
	function removeSub(link, soft = false) {
		const { dep, prevSub, nextSub } = link;
		if (prevSub) {
			prevSub.nextSub = nextSub;
			link.prevSub = void 0;
		}
		if (nextSub) {
			nextSub.prevSub = prevSub;
			link.nextSub = void 0;
		}
		if (dep.subs === link) {
			dep.subs = prevSub;
			if (!prevSub && dep.computed) {
				dep.computed.flags &= -5;
				for (let l = dep.computed.deps; l; l = l.nextDep) removeSub(l, true);
			}
		}
		if (!soft && !--dep.sc && dep.map) dep.map.delete(dep.key);
	}
	function removeDep(link) {
		const { prevDep, nextDep } = link;
		if (prevDep) {
			prevDep.nextDep = nextDep;
			link.prevDep = void 0;
		}
		if (nextDep) {
			nextDep.prevDep = prevDep;
			link.nextDep = void 0;
		}
	}
	var shouldTrack = true;
	var trackStack = [];
	function pauseTracking() {
		trackStack.push(shouldTrack);
		shouldTrack = false;
	}
	function resetTracking() {
		const last = trackStack.pop();
		shouldTrack = last === void 0 ? true : last;
	}
	function cleanupEffect(e) {
		const { cleanup } = e;
		e.cleanup = void 0;
		if (cleanup) {
			const prevSub = activeSub;
			activeSub = void 0;
			try {
				cleanup();
			} finally {
				activeSub = prevSub;
			}
		}
	}
	var globalVersion = 0;
	var Link = class {
		constructor(sub, dep) {
			this.sub = sub;
			this.dep = dep;
			this.version = dep.version;
			this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
		}
	};
	var Dep = class {
		constructor(computed) {
			this.computed = computed;
			this.version = 0;
			/**
			* Link between this dep and the current active effect
			*/
			this.activeLink = void 0;
			/**
			* Doubly linked list representing the subscribing effects (tail)
			*/
			this.subs = void 0;
			/**
			* For object property deps cleanup
			*/
			this.map = void 0;
			this.key = void 0;
			/**
			* Subscriber counter
			*/
			this.sc = 0;
			/**
			* @internal
			*/
			this.__v_skip = true;
		}
		track(debugInfo) {
			if (!activeSub || !shouldTrack || activeSub === this.computed) return;
			let link = this.activeLink;
			if (link === void 0 || link.sub !== activeSub) {
				link = this.activeLink = new Link(activeSub, this);
				if (!activeSub.deps) activeSub.deps = activeSub.depsTail = link;
				else {
					link.prevDep = activeSub.depsTail;
					activeSub.depsTail.nextDep = link;
					activeSub.depsTail = link;
				}
				addSub(link);
			} else if (link.version === -1) {
				link.version = this.version;
				if (link.nextDep) {
					const next = link.nextDep;
					next.prevDep = link.prevDep;
					if (link.prevDep) link.prevDep.nextDep = next;
					link.prevDep = activeSub.depsTail;
					link.nextDep = void 0;
					activeSub.depsTail.nextDep = link;
					activeSub.depsTail = link;
					if (activeSub.deps === link) activeSub.deps = next;
				}
			}
			return link;
		}
		trigger(debugInfo) {
			this.version++;
			globalVersion++;
			this.notify(debugInfo);
		}
		notify(debugInfo) {
			startBatch();
			try {
				for (let link = this.subs; link; link = link.prevSub) if (link.sub.notify()) link.sub.dep.notify();
			} finally {
				endBatch();
			}
		}
	};
	function addSub(link) {
		link.dep.sc++;
		if (link.sub.flags & 4) {
			const computed = link.dep.computed;
			if (computed && !link.dep.subs) {
				computed.flags |= 20;
				for (let l = computed.deps; l; l = l.nextDep) addSub(l);
			}
			const currentTail = link.dep.subs;
			if (currentTail !== link) {
				link.prevSub = currentTail;
				if (currentTail) currentTail.nextSub = link;
			}
			link.dep.subs = link;
		}
	}
	var targetMap = /* @__PURE__ */ new WeakMap();
	var ITERATE_KEY = /* @__PURE__ */ Symbol("");
	var MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol("");
	var ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol("");
	function track(target, type, key) {
		if (shouldTrack && activeSub) {
			let depsMap = targetMap.get(target);
			if (!depsMap) targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
			let dep = depsMap.get(key);
			if (!dep) {
				depsMap.set(key, dep = new Dep());
				dep.map = depsMap;
				dep.key = key;
			}
			dep.track();
		}
	}
	function trigger(target, type, key, newValue, oldValue, oldTarget) {
		const depsMap = targetMap.get(target);
		if (!depsMap) {
			globalVersion++;
			return;
		}
		const run = (dep) => {
			if (dep) dep.trigger();
		};
		startBatch();
		if (type === "clear") depsMap.forEach(run);
		else {
			const targetIsArray = isArray(target);
			const isArrayIndex = targetIsArray && isIntegerKey(key);
			if (targetIsArray && key === "length") {
				const newLength = Number(newValue);
				depsMap.forEach((dep, key2) => {
					if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) run(dep);
				});
			} else {
				if (key !== void 0 || depsMap.has(void 0)) run(depsMap.get(key));
				if (isArrayIndex) run(depsMap.get(ARRAY_ITERATE_KEY));
				switch (type) {
					case "add":
						if (!targetIsArray) {
							run(depsMap.get(ITERATE_KEY));
							if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
						} else if (isArrayIndex) run(depsMap.get("length"));
						break;
					case "delete":
						if (!targetIsArray) {
							run(depsMap.get(ITERATE_KEY));
							if (isMap(target)) run(depsMap.get(MAP_KEY_ITERATE_KEY));
						}
						break;
					case "set":
						if (isMap(target)) run(depsMap.get(ITERATE_KEY));
						break;
				}
			}
		}
		endBatch();
	}
	function reactiveReadArray(array) {
		const raw = /* @__PURE__ */ toRaw(array);
		if (raw === array) return raw;
		track(raw, "iterate", ARRAY_ITERATE_KEY);
		return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
	}
	function shallowReadArray(arr) {
		track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
		return arr;
	}
	function toWrapped(target, item) {
		if (/* @__PURE__ */ isReadonly(target)) return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
		return toReactive(item);
	}
	var arrayInstrumentations = {
		__proto__: null,
		[Symbol.iterator]() {
			return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
		},
		concat(...args) {
			return reactiveReadArray(this).concat(...args.map((x) => isArray(x) ? reactiveReadArray(x) : x));
		},
		entries() {
			return iterator(this, "entries", (value) => {
				value[1] = toWrapped(this, value[1]);
				return value;
			});
		},
		every(fn, thisArg) {
			return apply(this, "every", fn, thisArg, void 0, arguments);
		},
		filter(fn, thisArg) {
			return apply(this, "filter", fn, thisArg, (v) => v.map((item) => toWrapped(this, item)), arguments);
		},
		find(fn, thisArg) {
			return apply(this, "find", fn, thisArg, (item) => toWrapped(this, item), arguments);
		},
		findIndex(fn, thisArg) {
			return apply(this, "findIndex", fn, thisArg, void 0, arguments);
		},
		findLast(fn, thisArg) {
			return apply(this, "findLast", fn, thisArg, (item) => toWrapped(this, item), arguments);
		},
		findLastIndex(fn, thisArg) {
			return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
		},
		forEach(fn, thisArg) {
			return apply(this, "forEach", fn, thisArg, void 0, arguments);
		},
		includes(...args) {
			return searchProxy(this, "includes", args);
		},
		indexOf(...args) {
			return searchProxy(this, "indexOf", args);
		},
		join(separator) {
			return reactiveReadArray(this).join(separator);
		},
		lastIndexOf(...args) {
			return searchProxy(this, "lastIndexOf", args);
		},
		map(fn, thisArg) {
			return apply(this, "map", fn, thisArg, void 0, arguments);
		},
		pop() {
			return noTracking(this, "pop");
		},
		push(...args) {
			return noTracking(this, "push", args);
		},
		reduce(fn, ...args) {
			return reduce(this, "reduce", fn, args);
		},
		reduceRight(fn, ...args) {
			return reduce(this, "reduceRight", fn, args);
		},
		shift() {
			return noTracking(this, "shift");
		},
		some(fn, thisArg) {
			return apply(this, "some", fn, thisArg, void 0, arguments);
		},
		splice(...args) {
			return noTracking(this, "splice", args);
		},
		toReversed() {
			return reactiveReadArray(this).toReversed();
		},
		toSorted(comparer) {
			return reactiveReadArray(this).toSorted(comparer);
		},
		toSpliced(...args) {
			return reactiveReadArray(this).toSpliced(...args);
		},
		unshift(...args) {
			return noTracking(this, "unshift", args);
		},
		values() {
			return iterator(this, "values", (item) => toWrapped(this, item));
		}
	};
	function iterator(self, method, wrapValue) {
		const arr = shallowReadArray(self);
		const iter = arr[method]();
		if (arr !== self && !/* @__PURE__ */ isShallow(self)) {
			iter._next = iter.next;
			iter.next = () => {
				const result = iter._next();
				if (!result.done) result.value = wrapValue(result.value);
				return result;
			};
		}
		return iter;
	}
	var arrayProto = Array.prototype;
	function apply(self, method, fn, thisArg, wrappedRetFn, args) {
		const arr = shallowReadArray(self);
		const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
		const methodFn = arr[method];
		if (methodFn !== arrayProto[method]) {
			const result2 = methodFn.apply(self, args);
			return needsWrap ? toReactive(result2) : result2;
		}
		let wrappedFn = fn;
		if (arr !== self) {
			if (needsWrap) wrappedFn = function(item, index) {
				return fn.call(this, toWrapped(self, item), index, self);
			};
			else if (fn.length > 2) wrappedFn = function(item, index) {
				return fn.call(this, item, index, self);
			};
		}
		const result = methodFn.call(arr, wrappedFn, thisArg);
		return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
	}
	function reduce(self, method, fn, args) {
		const arr = shallowReadArray(self);
		const needsWrap = arr !== self && !/* @__PURE__ */ isShallow(self);
		let wrappedFn = fn;
		let wrapInitialAccumulator = false;
		if (arr !== self) {
			if (needsWrap) {
				wrapInitialAccumulator = args.length === 0;
				wrappedFn = function(acc, item, index) {
					if (wrapInitialAccumulator) {
						wrapInitialAccumulator = false;
						acc = toWrapped(self, acc);
					}
					return fn.call(this, acc, toWrapped(self, item), index, self);
				};
			} else if (fn.length > 3) wrappedFn = function(acc, item, index) {
				return fn.call(this, acc, item, index, self);
			};
		}
		const result = arr[method](wrappedFn, ...args);
		return wrapInitialAccumulator ? toWrapped(self, result) : result;
	}
	function searchProxy(self, method, args) {
		const arr = /* @__PURE__ */ toRaw(self);
		track(arr, "iterate", ARRAY_ITERATE_KEY);
		const res = arr[method](...args);
		if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
			args[0] = /* @__PURE__ */ toRaw(args[0]);
			return arr[method](...args);
		}
		return res;
	}
	function noTracking(self, method, args = []) {
		pauseTracking();
		startBatch();
		const res = (/* @__PURE__ */ toRaw(self))[method].apply(self, args);
		endBatch();
		resetTracking();
		return res;
	}
	var isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
	var builtInSymbols = new Set(/* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol));
	function hasOwnProperty(key) {
		if (!isSymbol(key)) key = String(key);
		const obj = /* @__PURE__ */ toRaw(this);
		track(obj, "has", key);
		return obj.hasOwnProperty(key);
	}
	var BaseReactiveHandler = class {
		constructor(_isReadonly = false, _isShallow = false) {
			this._isReadonly = _isReadonly;
			this._isShallow = _isShallow;
		}
		get(target, key, receiver) {
			if (key === "__v_skip") return target["__v_skip"];
			const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
			if (key === "__v_isReactive") return !isReadonly2;
			else if (key === "__v_isReadonly") return isReadonly2;
			else if (key === "__v_isShallow") return isShallow2;
			else if (key === "__v_raw") {
				if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) return target;
				return;
			}
			const targetIsArray = isArray(target);
			if (!isReadonly2) {
				let fn;
				if (targetIsArray && (fn = arrayInstrumentations[key])) return fn;
				if (key === "hasOwnProperty") return hasOwnProperty;
			}
			const res = Reflect.get(target, key, /* @__PURE__ */ isRef(target) ? target : receiver);
			if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) return res;
			if (!isReadonly2) track(target, "get", key);
			if (isShallow2) return res;
			if (/* @__PURE__ */ isRef(res)) {
				const value = targetIsArray && isIntegerKey(key) ? res : res.value;
				return isReadonly2 && isObject(value) ? /* @__PURE__ */ readonly(value) : value;
			}
			if (isObject(res)) return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
			return res;
		}
	};
	var MutableReactiveHandler = class extends BaseReactiveHandler {
		constructor(isShallow2 = false) {
			super(false, isShallow2);
		}
		set(target, key, value, receiver) {
			let oldValue = target[key];
			const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
			if (!this._isShallow) {
				const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
				if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
					oldValue = /* @__PURE__ */ toRaw(oldValue);
					value = /* @__PURE__ */ toRaw(value);
				}
				if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) if (isOldValueReadonly) return true;
				else {
					oldValue.value = value;
					return true;
				}
			}
			const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
			const result = Reflect.set(target, key, value, /* @__PURE__ */ isRef(target) ? target : receiver);
			if (target === /* @__PURE__ */ toRaw(receiver) && result) {
				if (!hadKey) trigger(target, "add", key, value);
				else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
			}
			return result;
		}
		deleteProperty(target, key) {
			const hadKey = hasOwn(target, key);
			const oldValue = target[key];
			const result = Reflect.deleteProperty(target, key);
			if (result && hadKey) trigger(target, "delete", key, void 0, oldValue);
			return result;
		}
		has(target, key) {
			const result = Reflect.has(target, key);
			if (!isSymbol(key) || !builtInSymbols.has(key)) track(target, "has", key);
			return result;
		}
		ownKeys(target) {
			track(target, "iterate", isArray(target) ? "length" : ITERATE_KEY);
			return Reflect.ownKeys(target);
		}
	};
	var ReadonlyReactiveHandler = class extends BaseReactiveHandler {
		constructor(isShallow2 = false) {
			super(true, isShallow2);
		}
		set(target, key) {
			return true;
		}
		deleteProperty(target, key) {
			return true;
		}
	};
	var mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
	var readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
	var shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
	var toShallow = (value) => value;
	var getProto = (v) => Reflect.getPrototypeOf(v);
	function createIterableMethod(method, isReadonly2, isShallow2) {
		return function(...args) {
			const target = this["__v_raw"];
			const rawTarget = /* @__PURE__ */ toRaw(target);
			const targetIsMap = isMap(rawTarget);
			const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
			const isKeyOnly = method === "keys" && targetIsMap;
			const innerIterator = target[method](...args);
			const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
			!isReadonly2 && track(rawTarget, "iterate", isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
			return extend(Object.create(innerIterator), { next() {
				const { value, done } = innerIterator.next();
				return done ? {
					value,
					done
				} : {
					value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
					done
				};
			} });
		};
	}
	function createReadonlyMethod(type) {
		return function(...args) {
			return type === "delete" ? false : type === "clear" ? void 0 : this;
		};
	}
	function createInstrumentations(readonly, shallow) {
		const instrumentations = {
			get(key) {
				const target = this["__v_raw"];
				const rawTarget = /* @__PURE__ */ toRaw(target);
				const rawKey = /* @__PURE__ */ toRaw(key);
				if (!readonly) {
					if (hasChanged(key, rawKey)) track(rawTarget, "get", key);
					track(rawTarget, "get", rawKey);
				}
				const { has } = getProto(rawTarget);
				const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive;
				if (has.call(rawTarget, key)) return wrap(target.get(key));
				else if (has.call(rawTarget, rawKey)) return wrap(target.get(rawKey));
				else if (target !== rawTarget) target.get(key);
			},
			get size() {
				const target = this["__v_raw"];
				!readonly && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
				return target.size;
			},
			has(key) {
				const target = this["__v_raw"];
				const rawTarget = /* @__PURE__ */ toRaw(target);
				const rawKey = /* @__PURE__ */ toRaw(key);
				if (!readonly) {
					if (hasChanged(key, rawKey)) track(rawTarget, "has", key);
					track(rawTarget, "has", rawKey);
				}
				return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
			},
			forEach(callback, thisArg) {
				const observed = this;
				const target = observed["__v_raw"];
				const rawTarget = /* @__PURE__ */ toRaw(target);
				const wrap = shallow ? toShallow : readonly ? toReadonly : toReactive;
				!readonly && track(rawTarget, "iterate", ITERATE_KEY);
				return target.forEach((value, key) => {
					return callback.call(thisArg, wrap(value), wrap(key), observed);
				});
			}
		};
		extend(instrumentations, readonly ? {
			add: createReadonlyMethod("add"),
			set: createReadonlyMethod("set"),
			delete: createReadonlyMethod("delete"),
			clear: createReadonlyMethod("clear")
		} : {
			add(value) {
				const target = /* @__PURE__ */ toRaw(this);
				const proto = getProto(target);
				const rawValue = /* @__PURE__ */ toRaw(value);
				const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
				if (!(proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue))) {
					target.add(valueToAdd);
					trigger(target, "add", valueToAdd, valueToAdd);
				}
				return this;
			},
			set(key, value) {
				if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) value = /* @__PURE__ */ toRaw(value);
				const target = /* @__PURE__ */ toRaw(this);
				const { has, get } = getProto(target);
				let hadKey = has.call(target, key);
				if (!hadKey) {
					key = /* @__PURE__ */ toRaw(key);
					hadKey = has.call(target, key);
				}
				const oldValue = get.call(target, key);
				target.set(key, value);
				if (!hadKey) trigger(target, "add", key, value);
				else if (hasChanged(value, oldValue)) trigger(target, "set", key, value, oldValue);
				return this;
			},
			delete(key) {
				const target = /* @__PURE__ */ toRaw(this);
				const { has, get } = getProto(target);
				let hadKey = has.call(target, key);
				if (!hadKey) {
					key = /* @__PURE__ */ toRaw(key);
					hadKey = has.call(target, key);
				}
				const oldValue = get ? get.call(target, key) : void 0;
				const result = target.delete(key);
				if (hadKey) trigger(target, "delete", key, void 0, oldValue);
				return result;
			},
			clear() {
				const target = /* @__PURE__ */ toRaw(this);
				const hadItems = target.size !== 0;
				const oldTarget = void 0;
				const result = target.clear();
				if (hadItems) trigger(target, "clear", void 0, void 0, oldTarget);
				return result;
			}
		});
		[
			"keys",
			"values",
			"entries",
			Symbol.iterator
		].forEach((method) => {
			instrumentations[method] = createIterableMethod(method, readonly, shallow);
		});
		return instrumentations;
	}
	function createInstrumentationGetter(isReadonly2, shallow) {
		const instrumentations = createInstrumentations(isReadonly2, shallow);
		return (target, key, receiver) => {
			if (key === "__v_isReactive") return !isReadonly2;
			else if (key === "__v_isReadonly") return isReadonly2;
			else if (key === "__v_raw") return target;
			return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
		};
	}
	var mutableCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(false, false) };
	var shallowCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(false, true) };
	var readonlyCollectionHandlers = { get: /* @__PURE__ */ createInstrumentationGetter(true, false) };
	var reactiveMap = /* @__PURE__ */ new WeakMap();
	var shallowReactiveMap = /* @__PURE__ */ new WeakMap();
	var readonlyMap = /* @__PURE__ */ new WeakMap();
	var shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
	function targetTypeMap(rawType) {
		switch (rawType) {
			case "Object":
			case "Array": return 1;
			case "Map":
			case "Set":
			case "WeakMap":
			case "WeakSet": return 2;
			default: return 0;
		}
	}
	// @__NO_SIDE_EFFECTS__
	function reactive(target) {
		if (/* @__PURE__ */ isReadonly(target)) return target;
		return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap);
	}
	// @__NO_SIDE_EFFECTS__
	function shallowReactive(target) {
		return createReactiveObject(target, false, shallowReactiveHandlers, shallowCollectionHandlers, shallowReactiveMap);
	}
	// @__NO_SIDE_EFFECTS__
	function readonly(target) {
		return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers, readonlyMap);
	}
	function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
		if (!isObject(target)) return target;
		if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) return target;
		if (target["__v_skip"] || !Object.isExtensible(target)) return target;
		const existingProxy = proxyMap.get(target);
		if (existingProxy) return existingProxy;
		const targetType = targetTypeMap(toRawType(target));
		if (targetType === 0) return target;
		const proxy = new Proxy(target, targetType === 2 ? collectionHandlers : baseHandlers);
		proxyMap.set(target, proxy);
		return proxy;
	}
	// @__NO_SIDE_EFFECTS__
	function isReactive(value) {
		if (/* @__PURE__ */ isReadonly(value)) return /* @__PURE__ */ isReactive(value["__v_raw"]);
		return !!(value && value["__v_isReactive"]);
	}
	// @__NO_SIDE_EFFECTS__
	function isReadonly(value) {
		return !!(value && value["__v_isReadonly"]);
	}
	// @__NO_SIDE_EFFECTS__
	function isShallow(value) {
		return !!(value && value["__v_isShallow"]);
	}
	// @__NO_SIDE_EFFECTS__
	function isProxy(value) {
		return value ? !!value["__v_raw"] : false;
	}
	// @__NO_SIDE_EFFECTS__
	function toRaw(observed) {
		const raw = observed && observed["__v_raw"];
		return raw ? /* @__PURE__ */ toRaw(raw) : observed;
	}
	function markRaw(value) {
		if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) def(value, "__v_skip", true);
		return value;
	}
	var toReactive = (value) => isObject(value) ? /* @__PURE__ */ reactive(value) : value;
	var toReadonly = (value) => isObject(value) ? /* @__PURE__ */ readonly(value) : value;
	// @__NO_SIDE_EFFECTS__
	function isRef(r) {
		return r ? r["__v_isRef"] === true : false;
	}
	// @__NO_SIDE_EFFECTS__
	function ref(value) {
		return createRef(value, false);
	}
	function createRef(rawValue, shallow) {
		if (/* @__PURE__ */ isRef(rawValue)) return rawValue;
		return new RefImpl(rawValue, shallow);
	}
	var RefImpl = class {
		constructor(value, isShallow2) {
			this.dep = new Dep();
			this["__v_isRef"] = true;
			this["__v_isShallow"] = false;
			this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
			this._value = isShallow2 ? value : toReactive(value);
			this["__v_isShallow"] = isShallow2;
		}
		get value() {
			this.dep.track();
			return this._value;
		}
		set value(newValue) {
			const oldValue = this._rawValue;
			const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
			newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
			if (hasChanged(newValue, oldValue)) {
				this._rawValue = newValue;
				this._value = useDirectValue ? newValue : toReactive(newValue);
				this.dep.trigger();
			}
		}
	};
	function unref(ref2) {
		return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
	}
	var shallowUnwrapHandlers = {
		get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
		set: (target, key, value, receiver) => {
			const oldValue = target[key];
			if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
				oldValue.value = value;
				return true;
			} else return Reflect.set(target, key, value, receiver);
		}
	};
	function proxyRefs(objectWithRefs) {
		return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
	}
	var ComputedRefImpl = class {
		constructor(fn, setter, isSSR) {
			this.fn = fn;
			this.setter = setter;
			/**
			* @internal
			*/
			this._value = void 0;
			/**
			* @internal
			*/
			this.dep = new Dep(this);
			/**
			* @internal
			*/
			this.__v_isRef = true;
			/**
			* @internal
			*/
			this.deps = void 0;
			/**
			* @internal
			*/
			this.depsTail = void 0;
			/**
			* @internal
			*/
			this.flags = 16;
			/**
			* @internal
			*/
			this.globalVersion = globalVersion - 1;
			/**
			* @internal
			*/
			this.next = void 0;
			this.effect = this;
			this["__v_isReadonly"] = !setter;
			this.isSSR = isSSR;
		}
		/**
		* @internal
		*/
		notify() {
			this.flags |= 16;
			if (!(this.flags & 8) && activeSub !== this) {
				batch(this, true);
				return true;
			}
		}
		get value() {
			const link = this.dep.track();
			refreshComputed(this);
			if (link) link.version = this.dep.version;
			return this._value;
		}
		set value(newValue) {
			if (this.setter) this.setter(newValue);
		}
	};
	// @__NO_SIDE_EFFECTS__
	function computed$1(getterOrOptions, debugOptions, isSSR = false) {
		let getter;
		let setter;
		if (isFunction(getterOrOptions)) getter = getterOrOptions;
		else {
			getter = getterOrOptions.get;
			setter = getterOrOptions.set;
		}
		return new ComputedRefImpl(getter, setter, isSSR);
	}
	var INITIAL_WATCHER_VALUE = {};
	var cleanupMap = /* @__PURE__ */ new WeakMap();
	var activeWatcher = void 0;
	function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
		if (owner) {
			let cleanups = cleanupMap.get(owner);
			if (!cleanups) cleanupMap.set(owner, cleanups = []);
			cleanups.push(cleanupFn);
		}
	}
	function watch$1(source, cb, options = EMPTY_OBJ) {
		const { immediate, deep, once, scheduler, augmentJob, call } = options;
		const reactiveGetter = (source2) => {
			if (deep) return source2;
			if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0) return traverse(source2, 1);
			return traverse(source2);
		};
		let effect;
		let getter;
		let cleanup;
		let boundCleanup;
		let forceTrigger = false;
		let isMultiSource = false;
		if (/* @__PURE__ */ isRef(source)) {
			getter = () => source.value;
			forceTrigger = /* @__PURE__ */ isShallow(source);
		} else if (/* @__PURE__ */ isReactive(source)) {
			getter = () => reactiveGetter(source);
			forceTrigger = true;
		} else if (isArray(source)) {
			isMultiSource = true;
			forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
			getter = () => source.map((s) => {
				if (/* @__PURE__ */ isRef(s)) return s.value;
				else if (/* @__PURE__ */ isReactive(s)) return reactiveGetter(s);
				else if (isFunction(s)) return call ? call(s, 2) : s();
			});
		} else if (isFunction(source)) if (cb) getter = call ? () => call(source, 2) : source;
		else getter = () => {
			if (cleanup) {
				pauseTracking();
				try {
					cleanup();
				} finally {
					resetTracking();
				}
			}
			const currentEffect = activeWatcher;
			activeWatcher = effect;
			try {
				return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
			} finally {
				activeWatcher = currentEffect;
			}
		};
		else getter = NOOP;
		if (cb && deep) {
			const baseGetter = getter;
			const depth = deep === true ? Infinity : deep;
			getter = () => traverse(baseGetter(), depth);
		}
		const scope = getCurrentScope();
		const watchHandle = () => {
			effect.stop();
			if (scope && scope.active) remove(scope.effects, effect);
		};
		if (once && cb) {
			const _cb = cb;
			cb = (...args) => {
				const res = _cb(...args);
				watchHandle();
				return res;
			};
		}
		let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
		const job = (immediateFirstRun) => {
			if (!(effect.flags & 1) || !effect.dirty && !immediateFirstRun) return;
			if (cb) {
				const newValue = effect.run();
				if (immediateFirstRun || deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
					if (cleanup) cleanup();
					const currentWatcher = activeWatcher;
					activeWatcher = effect;
					try {
						const args = [
							newValue,
							oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
							boundCleanup
						];
						oldValue = newValue;
						call ? call(cb, 3, args) : cb(...args);
					} finally {
						activeWatcher = currentWatcher;
					}
				}
			} else effect.run();
		};
		if (augmentJob) augmentJob(job);
		effect = new ReactiveEffect(getter);
		effect.scheduler = scheduler ? () => scheduler(job, false) : job;
		boundCleanup = (fn) => onWatcherCleanup(fn, false, effect);
		cleanup = effect.onStop = () => {
			const cleanups = cleanupMap.get(effect);
			if (cleanups) {
				if (call) call(cleanups, 4);
				else for (const cleanup2 of cleanups) cleanup2();
				cleanupMap.delete(effect);
			}
		};
		if (cb) if (immediate) job(true);
		else oldValue = effect.run();
		else if (scheduler) scheduler(job.bind(null, true), true);
		else effect.run();
		watchHandle.pause = effect.pause.bind(effect);
		watchHandle.resume = effect.resume.bind(effect);
		watchHandle.stop = watchHandle;
		return watchHandle;
	}
	function traverse(value, depth = Infinity, seen) {
		if (depth <= 0 || !isObject(value) || value["__v_skip"]) return value;
		seen = seen || /* @__PURE__ */ new Map();
		if ((seen.get(value) || 0) >= depth) return value;
		seen.set(value, depth);
		depth--;
		if (/* @__PURE__ */ isRef(value)) traverse(value.value, depth, seen);
		else if (isArray(value)) for (let i = 0; i < value.length; i++) traverse(value[i], depth, seen);
		else if (isSet(value) || isMap(value)) value.forEach((v) => {
			traverse(v, depth, seen);
		});
		else if (isPlainObject(value)) {
			for (const key in value) traverse(value[key], depth, seen);
			for (const key of Object.getOwnPropertySymbols(value)) if (Object.prototype.propertyIsEnumerable.call(value, key)) traverse(value[key], depth, seen);
		}
		return value;
	}
	//#endregion
	//#region node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js
	/**
	* @vue/runtime-core v3.5.40
	* (c) 2018-present Yuxi (Evan) You and Vue contributors
	* @license MIT
	**/
	function callWithErrorHandling(fn, instance, type, args) {
		try {
			return args ? fn(...args) : fn();
		} catch (err) {
			handleError(err, instance, type);
		}
	}
	function callWithAsyncErrorHandling(fn, instance, type, args) {
		if (isFunction(fn)) {
			const res = callWithErrorHandling(fn, instance, type, args);
			if (res && isPromise(res)) res.catch((err) => {
				handleError(err, instance, type);
			});
			return res;
		}
		if (isArray(fn)) {
			const values = [];
			for (let i = 0; i < fn.length; i++) values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
			return values;
		}
	}
	function handleError(err, instance, type, throwInDev = true) {
		const contextVNode = instance ? instance.vnode : null;
		const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
		if (instance) {
			let cur = instance.parent;
			const exposedInstance = instance.proxy;
			const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
			while (cur) {
				const errorCapturedHooks = cur.ec;
				if (errorCapturedHooks) {
					for (let i = 0; i < errorCapturedHooks.length; i++) if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) return;
				}
				cur = cur.parent;
			}
			if (errorHandler) {
				pauseTracking();
				callWithErrorHandling(errorHandler, null, 10, [
					err,
					exposedInstance,
					errorInfo
				]);
				resetTracking();
				return;
			}
		}
		logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
	}
	function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
		if (throwInProd) throw err;
		else console.error(err);
	}
	var queue = [];
	var flushIndex = -1;
	var pendingPostFlushCbs = [];
	var activePostFlushCbs = null;
	var postFlushIndex = 0;
	var resolvedPromise = /* @__PURE__ */ Promise.resolve();
	var currentFlushPromise = null;
	function nextTick(fn) {
		const p = currentFlushPromise || resolvedPromise;
		return fn ? p.then(this ? fn.bind(this) : fn) : p;
	}
	function findInsertionIndex(id) {
		let start = flushIndex + 1;
		let end = queue.length;
		while (start < end) {
			const middle = start + end >>> 1;
			const middleJob = queue[middle];
			const middleJobId = getId(middleJob);
			if (middleJobId < id || middleJobId === id && middleJob.flags & 2) start = middle + 1;
			else end = middle;
		}
		return start;
	}
	function queueJob(job) {
		if (!(job.flags & 1)) {
			const jobId = getId(job);
			const lastJob = queue[queue.length - 1];
			if (!lastJob || !(job.flags & 2) && jobId >= getId(lastJob)) queue.push(job);
			else queue.splice(findInsertionIndex(jobId), 0, job);
			job.flags |= 1;
			queueFlush();
		}
	}
	function queueFlush() {
		if (!currentFlushPromise) currentFlushPromise = resolvedPromise.then(flushJobs);
	}
	function queuePostFlushCb(cb) {
		if (!isArray(cb)) {
			if (activePostFlushCbs && cb.id === -1) activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
			else if (!(cb.flags & 1)) {
				pendingPostFlushCbs.push(cb);
				cb.flags |= 1;
			}
		} else pendingPostFlushCbs.push(...cb);
		queueFlush();
	}
	function flushPreFlushCbs(instance, seen, i = flushIndex + 1) {
		for (; i < queue.length; i++) {
			const cb = queue[i];
			if (cb && cb.flags & 2) {
				if (instance && cb.id !== instance.uid) continue;
				queue.splice(i, 1);
				i--;
				if (cb.flags & 4) cb.flags &= -2;
				cb();
				if (!(cb.flags & 4)) cb.flags &= -2;
			}
		}
	}
	function flushPostFlushCbs(seen) {
		if (pendingPostFlushCbs.length) {
			const deduped = [...new Set(pendingPostFlushCbs)].sort((a, b) => getId(a) - getId(b));
			pendingPostFlushCbs.length = 0;
			if (activePostFlushCbs) {
				activePostFlushCbs.push(...deduped);
				return;
			}
			activePostFlushCbs = deduped;
			for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
				const cb = activePostFlushCbs[postFlushIndex];
				if (cb.flags & 4) cb.flags &= -2;
				if (!(cb.flags & 8)) cb();
				cb.flags &= -2;
			}
			activePostFlushCbs = null;
			postFlushIndex = 0;
		}
	}
	var getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
	function flushJobs(seen) {
		try {
			for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
				const job = queue[flushIndex];
				if (job && !(job.flags & 8)) {
					if (job.flags & 4) job.flags &= -2;
					callWithErrorHandling(job, job.i, job.i ? 15 : 14);
					if (!(job.flags & 4)) job.flags &= -2;
				}
			}
		} finally {
			for (; flushIndex < queue.length; flushIndex++) {
				const job = queue[flushIndex];
				if (job) job.flags &= -2;
			}
			flushIndex = -1;
			queue.length = 0;
			flushPostFlushCbs(seen);
			currentFlushPromise = null;
			if (queue.length || pendingPostFlushCbs.length) flushJobs(seen);
		}
	}
	var currentRenderingInstance = null;
	var currentScopeId = null;
	function setCurrentRenderingInstance(instance) {
		const prev = currentRenderingInstance;
		currentRenderingInstance = instance;
		currentScopeId = instance && instance.type.__scopeId || null;
		return prev;
	}
	function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
		if (!ctx) return fn;
		if (fn._n) return fn;
		const renderFnWithContext = (...args) => {
			if (renderFnWithContext._d) setBlockTracking(-1);
			const prevInstance = setCurrentRenderingInstance(ctx);
			const prevStackSize = blockStack.length;
			let res;
			try {
				res = fn(...args);
			} finally {
				for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
				setCurrentRenderingInstance(prevInstance);
				if (renderFnWithContext._d) setBlockTracking(1);
			}
			return res;
		};
		renderFnWithContext._n = true;
		renderFnWithContext._c = true;
		renderFnWithContext._d = true;
		return renderFnWithContext;
	}
	function withDirectives(vnode, directives) {
		if (currentRenderingInstance === null) return vnode;
		const instance = getComponentPublicInstance(currentRenderingInstance);
		const bindings = vnode.dirs || (vnode.dirs = []);
		for (let i = 0; i < directives.length; i++) {
			let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
			if (dir) {
				if (isFunction(dir)) dir = {
					mounted: dir,
					updated: dir
				};
				if (dir.deep) traverse(value);
				bindings.push({
					dir,
					instance,
					value,
					oldValue: void 0,
					arg,
					modifiers
				});
			}
		}
		return vnode;
	}
	function invokeDirectiveHook(vnode, prevVNode, instance, name) {
		const bindings = vnode.dirs;
		const oldBindings = prevVNode && prevVNode.dirs;
		for (let i = 0; i < bindings.length; i++) {
			const binding = bindings[i];
			if (oldBindings) binding.oldValue = oldBindings[i].value;
			let hook = binding.dir[name];
			if (hook) {
				pauseTracking();
				callWithAsyncErrorHandling(hook, instance, 8, [
					vnode.el,
					binding,
					vnode,
					prevVNode
				]);
				resetTracking();
			}
		}
	}
	function provide(key, value) {
		if (currentInstance) {
			let provides = currentInstance.provides;
			const parentProvides = currentInstance.parent && currentInstance.parent.provides;
			if (parentProvides === provides) provides = currentInstance.provides = Object.create(parentProvides);
			provides[key] = value;
		}
	}
	function inject(key, defaultValue, treatDefaultAsFactory = false) {
		const instance = getCurrentInstance();
		if (instance || currentApp) {
			let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
			if (provides && key in provides) return provides[key];
			else if (arguments.length > 1) return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
		}
	}
	var ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
	var useSSRContext = () => {
		{
			const ctx = inject(ssrContextKey);
			if (!ctx) {}
			return ctx;
		}
	};
	function watch(source, cb, options) {
		return doWatch(source, cb, options);
	}
	function doWatch(source, cb, options = EMPTY_OBJ) {
		const { immediate, deep, flush, once } = options;
		const baseWatchOptions = extend({}, options);
		const runsImmediately = cb && immediate || !cb && flush !== "post";
		let ssrCleanup;
		if (isInSSRComponentSetup) {
			if (flush === "sync") {
				const ctx = useSSRContext();
				ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
			} else if (!runsImmediately) {
				const watchStopHandle = () => {};
				watchStopHandle.stop = NOOP;
				watchStopHandle.resume = NOOP;
				watchStopHandle.pause = NOOP;
				return watchStopHandle;
			}
		}
		const instance = currentInstance;
		baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
		let isPre = false;
		if (flush === "post") baseWatchOptions.scheduler = (job) => {
			queuePostRenderEffect(job, instance && instance.suspense);
		};
		else if (flush !== "sync") {
			isPre = true;
			baseWatchOptions.scheduler = (job, isFirstRun) => {
				if (isFirstRun) job();
				else queueJob(job);
			};
		}
		baseWatchOptions.augmentJob = (job) => {
			if (cb) job.flags |= 4;
			if (isPre) {
				job.flags |= 2;
				if (instance) {
					job.id = instance.uid;
					job.i = instance;
				}
			}
		};
		const watchHandle = watch$1(source, cb, baseWatchOptions);
		if (isInSSRComponentSetup) {
			if (ssrCleanup) ssrCleanup.push(watchHandle);
			else if (runsImmediately) watchHandle();
		}
		return watchHandle;
	}
	function instanceWatch(source, value, options) {
		const publicThis = this.proxy;
		const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
		let cb;
		if (isFunction(value)) cb = value;
		else {
			cb = value.handler;
			options = value;
		}
		const reset = setCurrentInstance(this);
		const res = doWatch(getter, cb.bind(publicThis), options);
		reset();
		return res;
	}
	function createPathGetter(ctx, path) {
		const segments = path.split(".");
		return () => {
			let cur = ctx;
			for (let i = 0; i < segments.length && cur; i++) cur = cur[segments[i]];
			return cur;
		};
	}
	var pendingMounts = /* @__PURE__ */ new WeakMap();
	var TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
	var isTeleport = (type) => type.__isTeleport;
	var isTeleportDisabled = (props) => props && (props.disabled || props.disabled === "");
	var isTeleportDeferred = (props) => props && (props.defer || props.defer === "");
	var isTargetSVG = (target) => typeof SVGElement !== "undefined" && target instanceof SVGElement;
	var isTargetMathML = (target) => typeof MathMLElement === "function" && target instanceof MathMLElement;
	var resolveTarget = (props, select) => {
		const targetSelector = props && props.to;
		if (isString(targetSelector)) if (!select) return null;
		else return select(targetSelector);
		else return targetSelector;
	};
	var TeleportImpl = {
		name: "Teleport",
		__isTeleport: true,
		process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals) {
			const { mc: mountChildren, pc: patchChildren, pbc: patchBlockChildren, o: { insert, querySelector, createText, createComment, parentNode } } = internals;
			const disabled = isTeleportDisabled(n2.props);
			let { dynamicChildren } = n2;
			const mount = (vnode, container2, anchor2) => {
				if (vnode.shapeFlag & 16) mountChildren(vnode.children, container2, anchor2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			};
			const mountToTarget = (vnode = n2) => {
				const disabled2 = isTeleportDisabled(vnode.props);
				const target = vnode.target = resolveTarget(vnode.props, querySelector);
				const targetAnchor = prepareAnchor(target, vnode, createText, insert);
				if (target) {
					if (namespace !== "svg" && isTargetSVG(target)) namespace = "svg";
					else if (namespace !== "mathml" && isTargetMathML(target)) namespace = "mathml";
					if (parentComponent && parentComponent.isCE) (parentComponent.ce._teleportTargets || (parentComponent.ce._teleportTargets = /* @__PURE__ */ new Set())).add(target);
					if (!disabled2) {
						mount(vnode, target, targetAnchor);
						updateCssVars(vnode, false);
					}
				}
			};
			const queuePendingMount = (vnode) => {
				const mountJob = () => {
					if (pendingMounts.get(vnode) !== mountJob) return;
					pendingMounts.delete(vnode);
					if (isTeleportDisabled(vnode.props)) {
						const mountContainer = parentNode(vnode.el) || container;
						mount(vnode, mountContainer, vnode.anchor);
						updateCssVars(vnode, true);
					}
					mountToTarget(vnode);
				};
				pendingMounts.set(vnode, mountJob);
				queuePostRenderEffect(mountJob, parentSuspense);
			};
			if (n1 == null) {
				const placeholder = n2.el = createText("");
				const mainAnchor = n2.anchor = createText("");
				insert(placeholder, container, anchor);
				insert(mainAnchor, container, anchor);
				if (isTeleportDeferred(n2.props) || parentSuspense && parentSuspense.pendingBranch) {
					queuePendingMount(n2);
					return;
				}
				if (disabled) {
					mount(n2, container, mainAnchor);
					updateCssVars(n2, true);
				}
				mountToTarget();
			} else {
				n2.el = n1.el;
				const mainAnchor = n2.anchor = n1.anchor;
				const pendingMount = pendingMounts.get(n1);
				if (pendingMount) {
					pendingMount.flags |= 8;
					pendingMounts.delete(n1);
					queuePendingMount(n2);
					return;
				}
				n2.targetStart = n1.targetStart;
				const target = n2.target = n1.target;
				const targetAnchor = n2.targetAnchor = n1.targetAnchor;
				const wasDisabled = isTeleportDisabled(n1.props);
				const currentContainer = wasDisabled ? container : target;
				const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;
				if (namespace === "svg" || isTargetSVG(target)) namespace = "svg";
				else if (namespace === "mathml" || isTargetMathML(target)) namespace = "mathml";
				if (dynamicChildren) {
					patchBlockChildren(n1.dynamicChildren, dynamicChildren, currentContainer, parentComponent, parentSuspense, namespace, slotScopeIds);
					traverseStaticChildren(n1, n2, true);
				} else if (!optimized) patchChildren(n1, n2, currentContainer, currentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, false);
				if (disabled) {
					if (!wasDisabled) moveTeleport(n2, container, mainAnchor, internals, 1);
					else if (n2.props && n1.props && n2.props.to !== n1.props.to) n2.props.to = n1.props.to;
				} else if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
					const nextTarget = resolveTarget(n2.props, querySelector);
					if (nextTarget) {
						n2.target = nextTarget;
						moveTeleport(n2, nextTarget, null, internals, 0);
					}
				} else if (wasDisabled) moveTeleport(n2, target, targetAnchor, internals, 1);
				updateCssVars(n2, disabled);
			}
		},
		remove(vnode, parentComponent, parentSuspense, { um: unmount, o: { remove: hostRemove } }, doRemove) {
			const { shapeFlag, children, anchor, targetStart, targetAnchor, target, props } = vnode;
			const disabled = isTeleportDisabled(props);
			const shouldRemove = doRemove || !disabled;
			const pendingMount = pendingMounts.get(vnode);
			if (pendingMount) {
				pendingMount.flags |= 8;
				pendingMounts.delete(vnode);
			}
			if (target) {
				hostRemove(targetStart);
				hostRemove(targetAnchor);
			}
			doRemove && hostRemove(anchor);
			if (!pendingMount && (disabled || target) && shapeFlag & 16) for (let i = 0; i < children.length; i++) {
				const child = children[i];
				unmount(child, parentComponent, parentSuspense, shouldRemove, !!child.dynamicChildren);
			}
		},
		move: moveTeleport,
		hydrate: hydrateTeleport
	};
	function moveTeleport(vnode, container, parentAnchor, { o: { insert }, m: move }, moveType = 2) {
		if (moveType === 0) insert(vnode.targetAnchor, container, parentAnchor);
		const { el, anchor, shapeFlag, children, props } = vnode;
		const isReorder = moveType === 2;
		if (isReorder) insert(el, container, parentAnchor);
		if (!pendingMounts.has(vnode) && (!isReorder || isTeleportDisabled(props))) {
			if (shapeFlag & 16) for (let i = 0; i < children.length; i++) move(children[i], container, parentAnchor, 2);
		}
		if (isReorder) insert(anchor, container, parentAnchor);
	}
	function hydrateTeleport(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized, { o: { nextSibling, parentNode, querySelector, insert, createText } }, hydrateChildren) {
		function hydrateAnchor(target2, targetNode) {
			let targetAnchor = targetNode;
			while (targetAnchor) {
				if (targetAnchor && targetAnchor.nodeType === 8) {
					if (targetAnchor.data === "teleport start anchor") vnode.targetStart = targetAnchor;
					else if (targetAnchor.data === "teleport anchor") {
						vnode.targetAnchor = targetAnchor;
						target2._lpa = vnode.targetAnchor && nextSibling(vnode.targetAnchor);
						break;
					}
				}
				targetAnchor = nextSibling(targetAnchor);
			}
		}
		function hydrateDisabledTeleport(node2, vnode2) {
			vnode2.anchor = hydrateChildren(nextSibling(node2), vnode2, parentNode(node2), parentComponent, parentSuspense, slotScopeIds, optimized);
		}
		const target = vnode.target = resolveTarget(vnode.props, querySelector);
		const disabled = isTeleportDisabled(vnode.props);
		if (target) {
			const targetNode = target._lpa || target.firstChild;
			if (vnode.shapeFlag & 16) if (disabled) {
				hydrateDisabledTeleport(node, vnode);
				hydrateAnchor(target, targetNode);
				if (!vnode.targetAnchor) prepareAnchor(target, vnode, createText, insert, parentNode(node) === target ? node : null);
			} else {
				vnode.anchor = nextSibling(node);
				hydrateAnchor(target, targetNode);
				if (!vnode.targetAnchor) prepareAnchor(target, vnode, createText, insert);
				hydrateChildren(targetNode && nextSibling(targetNode), vnode, target, parentComponent, parentSuspense, slotScopeIds, optimized);
			}
			updateCssVars(vnode, disabled);
		} else if (disabled) {
			if (vnode.shapeFlag & 16) {
				hydrateDisabledTeleport(node, vnode);
				vnode.targetStart = node;
				vnode.targetAnchor = nextSibling(node);
			}
		}
		return vnode.anchor && nextSibling(vnode.anchor);
	}
	var Teleport = TeleportImpl;
	function updateCssVars(vnode, isDisabled) {
		const ctx = vnode.ctx;
		if (ctx && ctx.ut) {
			let node, anchor;
			if (isDisabled) {
				node = vnode.el;
				anchor = vnode.anchor;
			} else {
				node = vnode.targetStart;
				anchor = vnode.targetAnchor;
			}
			while (node && node !== anchor) {
				if (node.nodeType === 1) node.setAttribute("data-v-owner", ctx.uid);
				node = node.nextSibling;
			}
			ctx.ut();
		}
	}
	function prepareAnchor(target, vnode, createText, insert, anchor = null) {
		const targetStart = vnode.targetStart = createText("");
		const targetAnchor = vnode.targetAnchor = createText("");
		targetStart[TeleportEndKey] = targetAnchor;
		if (target) {
			insert(targetStart, target, anchor);
			insert(targetAnchor, target, anchor);
		}
		return targetAnchor;
	}
	var leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
	function setTransitionHooks(vnode, hooks) {
		if (vnode.shapeFlag & 6 && vnode.component) {
			vnode.transition = hooks;
			setTransitionHooks(vnode.component.subTree, hooks);
		} else if (vnode.shapeFlag & 128) {
			vnode.ssContent.transition = hooks.clone(vnode.ssContent);
			vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
		} else vnode.transition = hooks;
	}
	function markAsyncBoundary(instance) {
		instance.ids = [
			instance.ids[0] + instance.ids[2]++ + "-",
			0,
			0
		];
	}
	function isTemplateRefKey(refs, key) {
		let desc;
		return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
	}
	var pendingSetRefMap = /* @__PURE__ */ new WeakMap();
	function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
		if (isArray(rawRef)) {
			rawRef.forEach((r, i) => setRef(r, oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef), parentSuspense, vnode, isUnmount));
			return;
		}
		if (isAsyncWrapper(vnode) && !isUnmount) {
			if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
			return;
		}
		const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
		const value = isUnmount ? null : refValue;
		const { i: owner, r: ref } = rawRef;
		const oldRef = oldRawRef && oldRawRef.r;
		const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
		const setupState = owner.setupState;
		const rawSetupState = /* @__PURE__ */ toRaw(setupState);
		const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
			if (isTemplateRefKey(refs, key)) return false;
			return hasOwn(rawSetupState, key);
		};
		const canSetRef = (ref2, key) => {
			if (key && isTemplateRefKey(refs, key)) return false;
			return true;
		};
		if (oldRef != null && oldRef !== ref) {
			invalidatePendingSetRef(oldRawRef);
			if (isString(oldRef)) {
				refs[oldRef] = null;
				if (canSetSetupRef(oldRef)) setupState[oldRef] = null;
			} else if (/* @__PURE__ */ isRef(oldRef)) {
				const oldRawRefAtom = oldRawRef;
				if (canSetRef(oldRef, oldRawRefAtom.k)) oldRef.value = null;
				if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
			}
		}
		if (isFunction(ref)) callWithErrorHandling(ref, owner, 12, [value, refs]);
		else {
			const _isString = isString(ref);
			const _isRef = /* @__PURE__ */ isRef(ref);
			if (_isString || _isRef) {
				const doSet = () => {
					if (rawRef.f) {
						const existing = _isString ? canSetSetupRef(ref) ? setupState[ref] : refs[ref] : canSetRef(ref) || !rawRef.k ? ref.value : refs[rawRef.k];
						if (isUnmount) isArray(existing) && remove(existing, refValue);
						else if (!isArray(existing)) if (_isString) {
							refs[ref] = [refValue];
							if (canSetSetupRef(ref)) setupState[ref] = refs[ref];
						} else {
							const newVal = [refValue];
							if (canSetRef(ref, rawRef.k)) ref.value = newVal;
							if (rawRef.k) refs[rawRef.k] = newVal;
						}
						else if (!existing.includes(refValue)) existing.push(refValue);
					} else if (_isString) {
						refs[ref] = value;
						if (canSetSetupRef(ref)) setupState[ref] = value;
					} else if (_isRef) {
						if (canSetRef(ref, rawRef.k)) ref.value = value;
						if (rawRef.k) refs[rawRef.k] = value;
					}
				};
				if (value) {
					const job = () => {
						doSet();
						pendingSetRefMap.delete(rawRef);
					};
					job.id = -1;
					pendingSetRefMap.set(rawRef, job);
					queuePostRenderEffect(job, parentSuspense);
				} else {
					invalidatePendingSetRef(rawRef);
					doSet();
				}
			}
		}
	}
	function invalidatePendingSetRef(rawRef) {
		const pendingSetRef = pendingSetRefMap.get(rawRef);
		if (pendingSetRef) {
			pendingSetRef.flags |= 8;
			pendingSetRefMap.delete(rawRef);
		}
	}
	getGlobalThis().requestIdleCallback;
	getGlobalThis().cancelIdleCallback;
	var isAsyncWrapper = (i) => !!i.type.__asyncLoader;
	var isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
	function onActivated(hook, target) {
		registerKeepAliveHook(hook, "a", target);
	}
	function onDeactivated(hook, target) {
		registerKeepAliveHook(hook, "da", target);
	}
	function registerKeepAliveHook(hook, type, target = currentInstance) {
		const wrappedHook = hook.__wdc || (hook.__wdc = () => {
			let current = target;
			while (current) {
				if (current.isDeactivated) return;
				current = current.parent;
			}
			return hook();
		});
		injectHook(type, wrappedHook, target);
		if (target) {
			let current = target.parent;
			while (current && current.parent) {
				if (isKeepAlive(current.parent.vnode)) injectToKeepAliveRoot(wrappedHook, type, target, current);
				current = current.parent;
			}
		}
	}
	function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
		const injected = injectHook(type, hook, keepAliveRoot, true);
		onUnmounted(() => {
			remove(keepAliveRoot[type], injected);
		}, target);
	}
	function injectHook(type, hook, target = currentInstance, prepend = false) {
		if (target) {
			const hooks = target[type] || (target[type] = []);
			const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
				pauseTracking();
				const reset = setCurrentInstance(target);
				const res = callWithAsyncErrorHandling(hook, target, type, args);
				reset();
				resetTracking();
				return res;
			});
			if (prepend) hooks.unshift(wrappedHook);
			else hooks.push(wrappedHook);
			return wrappedHook;
		}
	}
	var createHook = (lifecycle) => (hook, target = currentInstance) => {
		if (!isInSSRComponentSetup || lifecycle === "sp") injectHook(lifecycle, (...args) => hook(...args), target);
	};
	var onBeforeMount = createHook("bm");
	var onMounted = createHook("m");
	var onBeforeUpdate = createHook("bu");
	var onUpdated = createHook("u");
	var onBeforeUnmount = createHook("bum");
	var onUnmounted = createHook("um");
	var onServerPrefetch = createHook("sp");
	var onRenderTriggered = createHook("rtg");
	var onRenderTracked = createHook("rtc");
	function onErrorCaptured(hook, target = currentInstance) {
		injectHook("ec", hook, target);
	}
	var COMPONENTS = "components";
	function resolveComponent(name, maybeSelfReference) {
		return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name;
	}
	var NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
	function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
		const instance = currentRenderingInstance || currentInstance;
		if (instance) {
			const Component = instance.type;
			if (type === COMPONENTS) {
				const selfName = getComponentName(Component, false);
				if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) return Component;
			}
			const res = resolve(instance[type] || Component[type], name) || resolve(instance.appContext[type], name);
			if (!res && maybeSelfReference) return Component;
			return res;
		}
	}
	function resolve(registry, name) {
		return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
	}
	function renderList(source, renderItem, cache, index) {
		let ret;
		const cached = cache && cache[index];
		const sourceIsArray = isArray(source);
		if (sourceIsArray || isString(source)) {
			const sourceIsReactiveArray = sourceIsArray && /* @__PURE__ */ isReactive(source);
			let needsWrap = false;
			let isReadonlySource = false;
			if (sourceIsReactiveArray) {
				needsWrap = !/* @__PURE__ */ isShallow(source);
				isReadonlySource = /* @__PURE__ */ isReadonly(source);
				source = shallowReadArray(source);
			}
			ret = new Array(source.length);
			for (let i = 0, l = source.length; i < l; i++) ret[i] = renderItem(needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i], i, void 0, cached && cached[i]);
		} else if (typeof source === "number") {
			ret = new Array(source);
			for (let i = 0; i < source; i++) ret[i] = renderItem(i + 1, i, void 0, cached && cached[i]);
		} else if (isObject(source)) if (source[Symbol.iterator]) ret = Array.from(source, (item, i) => renderItem(item, i, void 0, cached && cached[i]));
		else {
			const keys = Object.keys(source);
			ret = new Array(keys.length);
			for (let i = 0, l = keys.length; i < l; i++) {
				const key = keys[i];
				ret[i] = renderItem(source[key], key, i, cached && cached[i]);
			}
		}
		else ret = [];
		if (cache) cache[index] = ret;
		return ret;
	}
	function renderSlot(slots, name, props = {}, fallback, noSlotted, branchKey) {
		if (currentRenderingInstance.ce || currentRenderingInstance.parent && isAsyncWrapper(currentRenderingInstance.parent) && currentRenderingInstance.parent.ce) {
			const slotProps = branchKey != null && props.key == null ? extend({}, props, { key: branchKey }) : props;
			const hasProps = Object.keys(slotProps).length > 0;
			if (name !== "default") slotProps.name = name;
			return openBlock(), createBlock(Fragment, null, [createVNode("slot", slotProps, fallback && fallback())], hasProps ? -2 : 64);
		}
		let slot = slots[name];
		if (slot && slot._c) slot._d = false;
		const prevStackSize = blockStack.length;
		openBlock();
		let rendered;
		try {
			const validSlotContent = slot && ensureValidVNode(slot(props));
			const slotKey = props.key || branchKey || validSlotContent && validSlotContent.key;
			rendered = createBlock(Fragment, { key: (slotKey && !isSymbol(slotKey) ? slotKey : `_${name}`) + (!validSlotContent && fallback ? "_fb" : "") }, validSlotContent || (fallback ? fallback() : []), validSlotContent && slots._ === 1 ? 64 : -2);
		} catch (err) {
			for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
			throw err;
		} finally {
			if (slot && slot._c) slot._d = true;
		}
		if (!noSlotted && rendered.scopeId) rendered.slotScopeIds = [rendered.scopeId + "-s"];
		return rendered;
	}
	function ensureValidVNode(vnodes) {
		return vnodes.some((child) => {
			if (!isVNode(child)) return true;
			if (child.type === Comment) return false;
			if (child.type === Fragment && !ensureValidVNode(child.children)) return false;
			return true;
		}) ? vnodes : null;
	}
	var getPublicInstance = (i) => {
		if (!i) return null;
		if (isStatefulComponent(i)) return getComponentPublicInstance(i);
		return getPublicInstance(i.parent);
	};
	var publicPropertiesMap = /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
		$: (i) => i,
		$el: (i) => i.vnode.el,
		$data: (i) => i.data,
		$props: (i) => i.props,
		$attrs: (i) => i.attrs,
		$slots: (i) => i.slots,
		$refs: (i) => i.refs,
		$parent: (i) => getPublicInstance(i.parent),
		$root: (i) => getPublicInstance(i.root),
		$host: (i) => i.ce,
		$emit: (i) => i.emit,
		$options: (i) => resolveMergedOptions(i),
		$forceUpdate: (i) => i.f || (i.f = () => {
			queueJob(i.update);
		}),
		$nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
		$watch: (i) => instanceWatch.bind(i)
	});
	var hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
	var PublicInstanceProxyHandlers = {
		get({ _: instance }, key) {
			if (key === "__v_skip") return true;
			const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
			if (key[0] !== "$") {
				const n = accessCache[key];
				if (n !== void 0) switch (n) {
					case 1: return setupState[key];
					case 2: return data[key];
					case 4: return ctx[key];
					case 3: return props[key];
				}
				else if (hasSetupBinding(setupState, key)) {
					accessCache[key] = 1;
					return setupState[key];
				} else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
					accessCache[key] = 2;
					return data[key];
				} else if (hasOwn(props, key)) {
					accessCache[key] = 3;
					return props[key];
				} else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
					accessCache[key] = 4;
					return ctx[key];
				} else if (shouldCacheAccess) accessCache[key] = 0;
			}
			const publicGetter = publicPropertiesMap[key];
			let cssModule, globalProperties;
			if (publicGetter) {
				if (key === "$attrs") track(instance.attrs, "get", "");
				return publicGetter(instance);
			} else if ((cssModule = type.__cssModules) && (cssModule = cssModule[key])) return cssModule;
			else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
				accessCache[key] = 4;
				return ctx[key];
			} else if (globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)) return globalProperties[key];
		},
		set({ _: instance }, key, value) {
			const { data, setupState, ctx } = instance;
			if (hasSetupBinding(setupState, key)) {
				setupState[key] = value;
				return true;
			} else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
				data[key] = value;
				return true;
			} else if (hasOwn(instance.props, key)) return false;
			if (key[0] === "$" && key.slice(1) in instance) return false;
			else ctx[key] = value;
			return true;
		},
		has({ _: { data, setupState, accessCache, ctx, appContext, props, type } }, key) {
			let cssModules;
			return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
		},
		defineProperty(target, key, descriptor) {
			if (descriptor.get != null) target._.accessCache[key] = 0;
			else if (hasOwn(descriptor, "value")) this.set(target, key, descriptor.value, null);
			return Reflect.defineProperty(target, key, descriptor);
		}
	};
	function normalizePropsOrEmits(props) {
		return isArray(props) ? props.reduce((normalized, p) => (normalized[p] = null, normalized), {}) : props;
	}
	var shouldCacheAccess = true;
	function applyOptions(instance) {
		const options = resolveMergedOptions(instance);
		const publicThis = instance.proxy;
		const ctx = instance.ctx;
		shouldCacheAccess = false;
		if (options.beforeCreate) callHook(options.beforeCreate, instance, "bc");
		const { data: dataOptions, computed: computedOptions, methods, watch: watchOptions, provide: provideOptions, inject: injectOptions, created, beforeMount, mounted, beforeUpdate, updated, activated, deactivated, beforeDestroy, beforeUnmount, destroyed, unmounted, render, renderTracked, renderTriggered, errorCaptured, serverPrefetch, expose, inheritAttrs, components, directives, filters } = options;
		const checkDuplicateProperties = null;
		if (injectOptions) resolveInjections(injectOptions, ctx, checkDuplicateProperties);
		if (methods) for (const key in methods) {
			const methodHandler = methods[key];
			if (isFunction(methodHandler)) ctx[key] = methodHandler.bind(publicThis);
		}
		if (dataOptions) {
			const data = dataOptions.call(publicThis, publicThis);
			if (!isObject(data)) {} else instance.data = /* @__PURE__ */ reactive(data);
		}
		shouldCacheAccess = true;
		if (computedOptions) for (const key in computedOptions) {
			const opt = computedOptions[key];
			const c = computed({
				get: isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP,
				set: !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP
			});
			Object.defineProperty(ctx, key, {
				enumerable: true,
				configurable: true,
				get: () => c.value,
				set: (v) => c.value = v
			});
		}
		if (watchOptions) for (const key in watchOptions) createWatcher(watchOptions[key], ctx, publicThis, key);
		if (provideOptions) {
			const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
			Reflect.ownKeys(provides).forEach((key) => {
				provide(key, provides[key]);
			});
		}
		if (created) callHook(created, instance, "c");
		function registerLifecycleHook(register, hook) {
			if (isArray(hook)) hook.forEach((_hook) => register(_hook.bind(publicThis)));
			else if (hook) register(hook.bind(publicThis));
		}
		registerLifecycleHook(onBeforeMount, beforeMount);
		registerLifecycleHook(onMounted, mounted);
		registerLifecycleHook(onBeforeUpdate, beforeUpdate);
		registerLifecycleHook(onUpdated, updated);
		registerLifecycleHook(onActivated, activated);
		registerLifecycleHook(onDeactivated, deactivated);
		registerLifecycleHook(onErrorCaptured, errorCaptured);
		registerLifecycleHook(onRenderTracked, renderTracked);
		registerLifecycleHook(onRenderTriggered, renderTriggered);
		registerLifecycleHook(onBeforeUnmount, beforeUnmount);
		registerLifecycleHook(onUnmounted, unmounted);
		registerLifecycleHook(onServerPrefetch, serverPrefetch);
		if (isArray(expose)) {
			if (expose.length) {
				const exposed = instance.exposed || (instance.exposed = {});
				expose.forEach((key) => {
					Object.defineProperty(exposed, key, {
						get: () => publicThis[key],
						set: (val) => publicThis[key] = val,
						enumerable: true
					});
				});
			} else if (!instance.exposed) instance.exposed = {};
		}
		if (render && instance.render === NOOP) instance.render = render;
		if (inheritAttrs != null) instance.inheritAttrs = inheritAttrs;
		if (components) instance.components = components;
		if (directives) instance.directives = directives;
		if (serverPrefetch) markAsyncBoundary(instance);
	}
	function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
		if (isArray(injectOptions)) injectOptions = normalizeInject(injectOptions);
		for (const key in injectOptions) {
			const opt = injectOptions[key];
			let injected;
			if (isObject(opt)) if ("default" in opt) injected = inject(opt.from || key, opt.default, true);
			else injected = inject(opt.from || key);
			else injected = inject(opt);
			if (/* @__PURE__ */ isRef(injected)) Object.defineProperty(ctx, key, {
				enumerable: true,
				configurable: true,
				get: () => injected.value,
				set: (v) => injected.value = v
			});
			else ctx[key] = injected;
		}
	}
	function callHook(hook, instance, type) {
		callWithAsyncErrorHandling(isArray(hook) ? hook.map((h) => h.bind(instance.proxy)) : hook.bind(instance.proxy), instance, type);
	}
	function createWatcher(raw, ctx, publicThis, key) {
		let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
		if (isString(raw)) {
			const handler = ctx[raw];
			if (isFunction(handler)) watch(getter, handler);
		} else if (isFunction(raw)) watch(getter, raw.bind(publicThis));
		else if (isObject(raw)) if (isArray(raw)) raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
		else {
			const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
			if (isFunction(handler)) watch(getter, handler, raw);
		}
	}
	function resolveMergedOptions(instance) {
		const base = instance.type;
		const { mixins, extends: extendsOptions } = base;
		const { mixins: globalMixins, optionsCache: cache, config: { optionMergeStrategies } } = instance.appContext;
		const cached = cache.get(base);
		let resolved;
		if (cached) resolved = cached;
		else if (!globalMixins.length && !mixins && !extendsOptions) resolved = base;
		else {
			resolved = {};
			if (globalMixins.length) globalMixins.forEach((m) => mergeOptions(resolved, m, optionMergeStrategies, true));
			mergeOptions(resolved, base, optionMergeStrategies);
		}
		if (isObject(base)) cache.set(base, resolved);
		return resolved;
	}
	function mergeOptions(to, from, strats, asMixin = false) {
		const { mixins, extends: extendsOptions } = from;
		if (extendsOptions) mergeOptions(to, extendsOptions, strats, true);
		if (mixins) mixins.forEach((m) => mergeOptions(to, m, strats, true));
		for (const key in from) if (asMixin && key === "expose") {} else {
			const strat = internalOptionMergeStrats[key] || strats && strats[key];
			to[key] = strat ? strat(to[key], from[key]) : from[key];
		}
		return to;
	}
	var internalOptionMergeStrats = {
		data: mergeDataFn,
		props: mergeEmitsOrPropsOptions,
		emits: mergeEmitsOrPropsOptions,
		methods: mergeObjectOptions,
		computed: mergeObjectOptions,
		beforeCreate: mergeAsArray,
		created: mergeAsArray,
		beforeMount: mergeAsArray,
		mounted: mergeAsArray,
		beforeUpdate: mergeAsArray,
		updated: mergeAsArray,
		beforeDestroy: mergeAsArray,
		beforeUnmount: mergeAsArray,
		destroyed: mergeAsArray,
		unmounted: mergeAsArray,
		activated: mergeAsArray,
		deactivated: mergeAsArray,
		errorCaptured: mergeAsArray,
		serverPrefetch: mergeAsArray,
		components: mergeObjectOptions,
		directives: mergeObjectOptions,
		watch: mergeWatchOptions,
		provide: mergeDataFn,
		inject: mergeInject
	};
	function mergeDataFn(to, from) {
		if (!from) return to;
		if (!to) return from;
		return function mergedDataFn() {
			return extend(isFunction(to) ? to.call(this, this) : to, isFunction(from) ? from.call(this, this) : from);
		};
	}
	function mergeInject(to, from) {
		return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
	}
	function normalizeInject(raw) {
		if (isArray(raw)) {
			const res = {};
			for (let i = 0; i < raw.length; i++) res[raw[i]] = raw[i];
			return res;
		}
		return raw;
	}
	function mergeAsArray(to, from) {
		return to ? [...new Set([].concat(to, from))] : from;
	}
	function mergeObjectOptions(to, from) {
		return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
	}
	function mergeEmitsOrPropsOptions(to, from) {
		if (to) {
			if (isArray(to) && isArray(from)) return [.../* @__PURE__ */ new Set([...to, ...from])];
			return extend(/* @__PURE__ */ Object.create(null), normalizePropsOrEmits(to), normalizePropsOrEmits(from != null ? from : {}));
		} else return from;
	}
	function mergeWatchOptions(to, from) {
		if (!to) return from;
		if (!from) return to;
		const merged = extend(/* @__PURE__ */ Object.create(null), to);
		for (const key in from) merged[key] = mergeAsArray(to[key], from[key]);
		return merged;
	}
	function createAppContext() {
		return {
			app: null,
			config: {
				isNativeTag: NO,
				performance: false,
				globalProperties: {},
				optionMergeStrategies: {},
				errorHandler: void 0,
				warnHandler: void 0,
				compilerOptions: {}
			},
			mixins: [],
			components: {},
			directives: {},
			provides: /* @__PURE__ */ Object.create(null),
			optionsCache: /* @__PURE__ */ new WeakMap(),
			propsCache: /* @__PURE__ */ new WeakMap(),
			emitsCache: /* @__PURE__ */ new WeakMap()
		};
	}
	var uid$1 = 0;
	function createAppAPI(render, hydrate) {
		return function createApp(rootComponent, rootProps = null) {
			if (!isFunction(rootComponent)) rootComponent = extend({}, rootComponent);
			if (rootProps != null && !isObject(rootProps)) rootProps = null;
			const context = createAppContext();
			const installedPlugins = /* @__PURE__ */ new WeakSet();
			const pluginCleanupFns = [];
			let isMounted = false;
			const app = context.app = {
				_uid: uid$1++,
				_component: rootComponent,
				_props: rootProps,
				_container: null,
				_context: context,
				_instance: null,
				version,
				get config() {
					return context.config;
				},
				set config(v) {},
				use(plugin, ...options) {
					if (installedPlugins.has(plugin)) {} else if (plugin && isFunction(plugin.install)) {
						installedPlugins.add(plugin);
						plugin.install(app, ...options);
					} else if (isFunction(plugin)) {
						installedPlugins.add(plugin);
						plugin(app, ...options);
					}
					return app;
				},
				mixin(mixin) {
					if (!context.mixins.includes(mixin)) context.mixins.push(mixin);
					return app;
				},
				component(name, component) {
					if (!component) return context.components[name];
					context.components[name] = component;
					return app;
				},
				directive(name, directive) {
					if (!directive) return context.directives[name];
					context.directives[name] = directive;
					return app;
				},
				mount(rootContainer, isHydrate, namespace) {
					if (!isMounted) {
						const vnode = app._ceVNode || createVNode(rootComponent, rootProps);
						vnode.appContext = context;
						if (namespace === true) namespace = "svg";
						else if (namespace === false) namespace = void 0;
						if (isHydrate && hydrate) hydrate(vnode, rootContainer);
						else render(vnode, rootContainer, namespace);
						isMounted = true;
						app._container = rootContainer;
						rootContainer.__vue_app__ = app;
						return getComponentPublicInstance(vnode.component);
					}
				},
				onUnmount(cleanupFn) {
					pluginCleanupFns.push(cleanupFn);
				},
				unmount() {
					if (isMounted) {
						callWithAsyncErrorHandling(pluginCleanupFns, app._instance, 16);
						render(null, app._container);
						delete app._container.__vue_app__;
					}
				},
				provide(key, value) {
					context.provides[key] = value;
					return app;
				},
				runWithContext(fn) {
					const lastApp = currentApp;
					currentApp = app;
					try {
						return fn();
					} finally {
						currentApp = lastApp;
					}
				}
			};
			return app;
		};
	}
	var currentApp = null;
	var getModelModifiers = (props, modelName) => {
		return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
	};
	function emit(instance, event, ...rawArgs) {
		if (instance.isUnmounted) return;
		const props = instance.vnode.props || EMPTY_OBJ;
		let args = rawArgs;
		const isModelListener = event.startsWith("update:");
		const modifiers = isModelListener && getModelModifiers(props, event.slice(7));
		if (modifiers) {
			if (modifiers.trim) args = rawArgs.map((a) => isString(a) ? a.trim() : a);
			if (modifiers.number) args = rawArgs.map(looseToNumber);
		}
		let handlerName;
		let handler = props[handlerName = toHandlerKey(event)] || props[handlerName = toHandlerKey(camelize(event))];
		if (!handler && isModelListener) handler = props[handlerName = toHandlerKey(hyphenate(event))];
		if (handler) callWithAsyncErrorHandling(handler, instance, 6, args);
		const onceHandler = props[handlerName + `Once`];
		if (onceHandler) {
			if (!instance.emitted) instance.emitted = {};
			else if (instance.emitted[handlerName]) return;
			instance.emitted[handlerName] = true;
			callWithAsyncErrorHandling(onceHandler, instance, 6, args);
		}
	}
	var mixinEmitsCache = /* @__PURE__ */ new WeakMap();
	function normalizeEmitsOptions(comp, appContext, asMixin = false) {
		const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
		const cached = cache.get(comp);
		if (cached !== void 0) return cached;
		const raw = comp.emits;
		let normalized = {};
		let hasExtends = false;
		if (!isFunction(comp)) {
			const extendEmits = (raw2) => {
				const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
				if (normalizedFromExtend) {
					hasExtends = true;
					extend(normalized, normalizedFromExtend);
				}
			};
			if (!asMixin && appContext.mixins.length) appContext.mixins.forEach(extendEmits);
			if (comp.extends) extendEmits(comp.extends);
			if (comp.mixins) comp.mixins.forEach(extendEmits);
		}
		if (!raw && !hasExtends) {
			if (isObject(comp)) cache.set(comp, null);
			return null;
		}
		if (isArray(raw)) raw.forEach((key) => normalized[key] = null);
		else extend(normalized, raw);
		if (isObject(comp)) cache.set(comp, normalized);
		return normalized;
	}
	function isEmitListener(options, key) {
		if (!options || !isOn(key)) return false;
		key = key.slice(2);
		key = key === "Once" ? key : key.replace(/Once$/, "");
		return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
	}
	function renderComponentRoot(instance) {
		const { type: Component, vnode, proxy, withProxy, propsOptions: [propsOptions], slots, attrs, emit, render, renderCache, props, data, setupState, ctx, inheritAttrs } = instance;
		const prev = setCurrentRenderingInstance(instance);
		let result;
		let fallthroughAttrs;
		try {
			if (vnode.shapeFlag & 4) {
				const proxyToUse = withProxy || proxy;
				const thisProxy = proxyToUse;
				result = normalizeVNode(render.call(thisProxy, proxyToUse, renderCache, props, setupState, data, ctx));
				fallthroughAttrs = attrs;
			} else {
				const render2 = Component;
				result = normalizeVNode(render2.length > 1 ? render2(props, {
					attrs,
					slots,
					emit
				}) : render2(props, null));
				fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
			}
		} catch (err) {
			blockStack.length = 0;
			handleError(err, instance, 1);
			result = createVNode(Comment);
		}
		let root = result;
		if (fallthroughAttrs && inheritAttrs !== false) {
			const keys = Object.keys(fallthroughAttrs);
			const { shapeFlag } = root;
			if (keys.length) {
				if (shapeFlag & 7) {
					if (propsOptions && keys.some(isModelListener)) fallthroughAttrs = filterModelListeners(fallthroughAttrs, propsOptions);
					root = cloneVNode(root, fallthroughAttrs, false, true);
				}
			}
		}
		if (vnode.dirs) {
			root = cloneVNode(root, null, false, true);
			root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
		}
		if (vnode.transition) setTransitionHooks(root, vnode.transition);
		result = root;
		setCurrentRenderingInstance(prev);
		return result;
	}
	var getFunctionalFallthrough = (attrs) => {
		let res;
		for (const key in attrs) if (key === "class" || key === "style" || isOn(key)) (res || (res = {}))[key] = attrs[key];
		return res;
	};
	var filterModelListeners = (attrs, props) => {
		const res = {};
		for (const key in attrs) if (!isModelListener(key) || !(key.slice(9) in props)) res[key] = attrs[key];
		return res;
	};
	function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
		const { props: prevProps, children: prevChildren, component } = prevVNode;
		const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
		const emits = component.emitsOptions;
		if (nextVNode.dirs || nextVNode.transition) return true;
		if (optimized && patchFlag >= 0) {
			if (patchFlag & 1024) return true;
			if (patchFlag & 16) {
				if (!prevProps) return !!nextProps;
				return hasPropsChanged(prevProps, nextProps, emits);
			} else if (patchFlag & 8) {
				const dynamicProps = nextVNode.dynamicProps;
				for (let i = 0; i < dynamicProps.length; i++) {
					const key = dynamicProps[i];
					if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) return true;
				}
			}
		} else {
			if (prevChildren || nextChildren) {
				if (!nextChildren || !nextChildren.$stable) return true;
			}
			if (prevProps === nextProps) return false;
			if (!prevProps) return !!nextProps;
			if (!nextProps) return true;
			return hasPropsChanged(prevProps, nextProps, emits);
		}
		return false;
	}
	function hasPropsChanged(prevProps, nextProps, emitsOptions) {
		const nextKeys = Object.keys(nextProps);
		if (nextKeys.length !== Object.keys(prevProps).length) return true;
		for (let i = 0; i < nextKeys.length; i++) {
			const key = nextKeys[i];
			if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) return true;
		}
		return false;
	}
	function hasPropValueChanged(nextProps, prevProps, key) {
		const nextProp = nextProps[key];
		const prevProp = prevProps[key];
		if (key === "style" && isObject(nextProp) && isObject(prevProp)) return !looseEqual(nextProp, prevProp);
		return nextProp !== prevProp;
	}
	function updateHOCHostEl({ vnode, parent, suspense }, el) {
		while (parent) {
			const root = parent.subTree;
			if (root.suspense && root.suspense.activeBranch === vnode) {
				root.suspense.vnode.el = root.el = el;
				vnode = root;
			}
			if (root === vnode) {
				(vnode = parent.vnode).el = el;
				parent = parent.parent;
			} else break;
		}
		if (suspense && suspense.activeBranch === vnode) suspense.vnode.el = el;
	}
	var internalObjectProto = {};
	var createInternalObject = () => Object.create(internalObjectProto);
	var isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
	function initProps(instance, rawProps, isStateful, isSSR = false) {
		const props = {};
		const attrs = createInternalObject();
		instance.propsDefaults = /* @__PURE__ */ Object.create(null);
		setFullProps(instance, rawProps, props, attrs);
		for (const key in instance.propsOptions[0]) if (!(key in props)) props[key] = void 0;
		if (isStateful) instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
		else if (!instance.type.props) instance.props = attrs;
		else instance.props = props;
		instance.attrs = attrs;
	}
	function updateProps(instance, rawProps, rawPrevProps, optimized) {
		const { props, attrs, vnode: { patchFlag } } = instance;
		const rawCurrentProps = /* @__PURE__ */ toRaw(props);
		const [options] = instance.propsOptions;
		let hasAttrsChanged = false;
		if ((optimized || patchFlag > 0) && !(patchFlag & 16)) {
			if (patchFlag & 8) {
				const propsToUpdate = instance.vnode.dynamicProps;
				for (let i = 0; i < propsToUpdate.length; i++) {
					let key = propsToUpdate[i];
					if (isEmitListener(instance.emitsOptions, key)) continue;
					const value = rawProps[key];
					if (options) if (hasOwn(attrs, key)) {
						if (value !== attrs[key]) {
							attrs[key] = value;
							hasAttrsChanged = true;
						}
					} else {
						const camelizedKey = camelize(key);
						props[camelizedKey] = resolvePropValue(options, rawCurrentProps, camelizedKey, value, instance, false);
					}
					else if (value !== attrs[key]) {
						attrs[key] = value;
						hasAttrsChanged = true;
					}
				}
			}
		} else {
			if (setFullProps(instance, rawProps, props, attrs)) hasAttrsChanged = true;
			let kebabKey;
			for (const key in rawCurrentProps) if (!rawProps || !hasOwn(rawProps, key) && ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) if (options) {
				if (rawPrevProps && (rawPrevProps[key] !== void 0 || rawPrevProps[kebabKey] !== void 0)) props[key] = resolvePropValue(options, rawCurrentProps, key, void 0, instance, true);
			} else delete props[key];
			if (attrs !== rawCurrentProps) {
				for (const key in attrs) if (!rawProps || !hasOwn(rawProps, key) && true) {
					delete attrs[key];
					hasAttrsChanged = true;
				}
			}
		}
		if (hasAttrsChanged) trigger(instance.attrs, "set", "");
	}
	function setFullProps(instance, rawProps, props, attrs) {
		const [options, needCastKeys] = instance.propsOptions;
		let hasAttrsChanged = false;
		let rawCastValues;
		if (rawProps) for (let key in rawProps) {
			if (isReservedProp(key)) continue;
			const value = rawProps[key];
			let camelKey;
			if (options && hasOwn(options, camelKey = camelize(key))) if (!needCastKeys || !needCastKeys.includes(camelKey)) props[camelKey] = value;
			else (rawCastValues || (rawCastValues = {}))[camelKey] = value;
			else if (!isEmitListener(instance.emitsOptions, key)) {
				if (!(key in attrs) || value !== attrs[key]) {
					attrs[key] = value;
					hasAttrsChanged = true;
				}
			}
		}
		if (needCastKeys) {
			const rawCurrentProps = /* @__PURE__ */ toRaw(props);
			const castValues = rawCastValues || EMPTY_OBJ;
			for (let i = 0; i < needCastKeys.length; i++) {
				const key = needCastKeys[i];
				props[key] = resolvePropValue(options, rawCurrentProps, key, castValues[key], instance, !hasOwn(castValues, key));
			}
		}
		return hasAttrsChanged;
	}
	function resolvePropValue(options, props, key, value, instance, isAbsent) {
		const opt = options[key];
		if (opt != null) {
			const hasDefault = hasOwn(opt, "default");
			if (hasDefault && value === void 0) {
				const defaultValue = opt.default;
				if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
					const { propsDefaults } = instance;
					if (key in propsDefaults) value = propsDefaults[key];
					else {
						const reset = setCurrentInstance(instance);
						value = propsDefaults[key] = defaultValue.call(null, props);
						reset();
					}
				} else value = defaultValue;
				if (instance.ce) instance.ce._setProp(key, value);
			}
			if (opt[0]) {
				if (isAbsent && !hasDefault) value = false;
				else if (opt[1] && (value === "" || value === hyphenate(key))) value = true;
			}
		}
		return value;
	}
	var mixinPropsCache = /* @__PURE__ */ new WeakMap();
	function normalizePropsOptions(comp, appContext, asMixin = false) {
		const cache = asMixin ? mixinPropsCache : appContext.propsCache;
		const cached = cache.get(comp);
		if (cached) return cached;
		const raw = comp.props;
		const normalized = {};
		const needCastKeys = [];
		let hasExtends = false;
		if (!isFunction(comp)) {
			const extendProps = (raw2) => {
				hasExtends = true;
				const [props, keys] = normalizePropsOptions(raw2, appContext, true);
				extend(normalized, props);
				if (keys) needCastKeys.push(...keys);
			};
			if (!asMixin && appContext.mixins.length) appContext.mixins.forEach(extendProps);
			if (comp.extends) extendProps(comp.extends);
			if (comp.mixins) comp.mixins.forEach(extendProps);
		}
		if (!raw && !hasExtends) {
			if (isObject(comp)) cache.set(comp, EMPTY_ARR);
			return EMPTY_ARR;
		}
		if (isArray(raw)) for (let i = 0; i < raw.length; i++) {
			const normalizedKey = camelize(raw[i]);
			if (validatePropName(normalizedKey)) normalized[normalizedKey] = EMPTY_OBJ;
		}
		else if (raw) for (const key in raw) {
			const normalizedKey = camelize(key);
			if (validatePropName(normalizedKey)) {
				const opt = raw[key];
				const prop = normalized[normalizedKey] = isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
				const propType = prop.type;
				let shouldCast = false;
				let shouldCastTrue = true;
				if (isArray(propType)) for (let index = 0; index < propType.length; ++index) {
					const type = propType[index];
					const typeName = isFunction(type) && type.name;
					if (typeName === "Boolean") {
						shouldCast = true;
						break;
					} else if (typeName === "String") shouldCastTrue = false;
				}
				else shouldCast = isFunction(propType) && propType.name === "Boolean";
				prop[0] = shouldCast;
				prop[1] = shouldCastTrue;
				if (shouldCast || hasOwn(prop, "default")) needCastKeys.push(normalizedKey);
			}
		}
		const res = [normalized, needCastKeys];
		if (isObject(comp)) cache.set(comp, res);
		return res;
	}
	function validatePropName(key) {
		if (key[0] !== "$" && !isReservedProp(key)) return true;
		return false;
	}
	var isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
	var normalizeSlotValue = (value) => isArray(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
	var normalizeSlot = (key, rawSlot, ctx) => {
		if (rawSlot._n) return rawSlot;
		const normalized = withCtx((...args) => {
			return normalizeSlotValue(rawSlot(...args));
		}, ctx);
		normalized._c = false;
		return normalized;
	};
	var normalizeObjectSlots = (rawSlots, slots, instance) => {
		const ctx = rawSlots._ctx;
		for (const key in rawSlots) {
			if (isInternalKey(key)) continue;
			const value = rawSlots[key];
			if (isFunction(value)) slots[key] = normalizeSlot(key, value, ctx);
			else if (value != null) {
				const normalized = normalizeSlotValue(value);
				slots[key] = () => normalized;
			}
		}
	};
	var normalizeVNodeSlots = (instance, children) => {
		const normalized = normalizeSlotValue(children);
		instance.slots.default = () => normalized;
	};
	var assignSlots = (slots, children, optimized) => {
		for (const key in children) if (optimized || !isInternalKey(key)) slots[key] = children[key];
	};
	var initSlots = (instance, children, optimized) => {
		const slots = instance.slots = createInternalObject();
		if (instance.vnode.shapeFlag & 32) {
			const type = children._;
			if (type) {
				assignSlots(slots, children, optimized);
				if (optimized) def(slots, "_", type, true);
			} else normalizeObjectSlots(children, slots);
		} else if (children) normalizeVNodeSlots(instance, children);
	};
	var updateSlots = (instance, children, optimized) => {
		const { vnode, slots } = instance;
		let needDeletionCheck = true;
		let deletionComparisonTarget = EMPTY_OBJ;
		if (vnode.shapeFlag & 32) {
			const type = children._;
			if (type) if (optimized && type === 1) needDeletionCheck = false;
			else assignSlots(slots, children, optimized);
			else {
				needDeletionCheck = !children.$stable;
				normalizeObjectSlots(children, slots);
			}
			deletionComparisonTarget = children;
		} else if (children) {
			normalizeVNodeSlots(instance, children);
			deletionComparisonTarget = { default: 1 };
		}
		if (needDeletionCheck) {
			for (const key in slots) if (!isInternalKey(key) && deletionComparisonTarget[key] == null) delete slots[key];
		}
	};
	var queuePostRenderEffect = queueEffectWithSuspense;
	function createRenderer(options) {
		return baseCreateRenderer(options);
	}
	function baseCreateRenderer(options, createHydrationFns) {
		const target = getGlobalThis();
		target.__VUE__ = true;
		const { insert: hostInsert, remove: hostRemove, patchProp: hostPatchProp, createElement: hostCreateElement, createText: hostCreateText, createComment: hostCreateComment, setText: hostSetText, setElementText: hostSetElementText, parentNode: hostParentNode, nextSibling: hostNextSibling, setScopeId: hostSetScopeId = NOOP, insertStaticContent: hostInsertStaticContent } = options;
		const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
			if (n1 === n2) return;
			if (n1 && !isSameVNodeType(n1, n2)) {
				anchor = getNextHostNode(n1);
				unmount(n1, parentComponent, parentSuspense, true);
				n1 = null;
			}
			if (n2.patchFlag === -2) {
				optimized = false;
				n2.dynamicChildren = null;
			}
			const { type, ref, shapeFlag } = n2;
			switch (type) {
				case Text:
					processText(n1, n2, container, anchor);
					break;
				case Comment:
					processCommentNode(n1, n2, container, anchor);
					break;
				case Static:
					if (n1 == null) mountStaticNode(n2, container, anchor, namespace);
					break;
				case Fragment:
					processFragment(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
					break;
				default: if (shapeFlag & 1) processElement(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				else if (shapeFlag & 6) processComponent(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				else if (shapeFlag & 64) type.process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals);
				else if (shapeFlag & 128) type.process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals);
			}
			if (ref != null && parentComponent) setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
			else if (ref == null && n1 && n1.ref != null) setRef(n1.ref, null, parentSuspense, n1, true);
		};
		const processText = (n1, n2, container, anchor) => {
			if (n1 == null) hostInsert(n2.el = hostCreateText(n2.children), container, anchor);
			else {
				const el = n2.el = n1.el;
				if (n2.children !== n1.children) hostSetText(el, n2.children);
			}
		};
		const processCommentNode = (n1, n2, container, anchor) => {
			if (n1 == null) hostInsert(n2.el = hostCreateComment(n2.children || ""), container, anchor);
			else n2.el = n1.el;
		};
		const mountStaticNode = (n2, container, anchor, namespace) => {
			[n2.el, n2.anchor] = hostInsertStaticContent(n2.children, container, anchor, namespace, n2.el, n2.anchor);
		};
		const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
			let next;
			while (el && el !== anchor) {
				next = hostNextSibling(el);
				hostInsert(el, container, nextSibling);
				el = next;
			}
			hostInsert(anchor, container, nextSibling);
		};
		const removeStaticNode = ({ el, anchor }) => {
			let next;
			while (el && el !== anchor) {
				next = hostNextSibling(el);
				hostRemove(el);
				el = next;
			}
			hostRemove(anchor);
		};
		const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			if (n2.type === "svg") namespace = "svg";
			else if (n2.type === "math") namespace = "mathml";
			if (n1 == null) mountElement(n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else {
				const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
				try {
					if (customElement) customElement._beginPatch();
					patchElement(n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				} finally {
					if (customElement) customElement._endPatch();
				}
			}
		};
		const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			let el;
			let vnodeHook;
			const { props, shapeFlag, transition, dirs } = vnode;
			el = vnode.el = hostCreateElement(vnode.type, namespace, props && props.is, props);
			if (shapeFlag & 8) hostSetElementText(el, vnode.children);
			else if (shapeFlag & 16) mountChildren(vnode.children, el, null, parentComponent, parentSuspense, resolveChildrenNamespace(vnode, namespace), slotScopeIds, optimized);
			if (dirs) invokeDirectiveHook(vnode, null, parentComponent, "created");
			setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
			if (props) {
				for (const key in props) if (key !== "value" && !isReservedProp(key)) hostPatchProp(el, key, null, props[key], namespace, parentComponent);
				if ("value" in props) hostPatchProp(el, "value", null, props.value, namespace);
				if (vnodeHook = props.onVnodeBeforeMount) invokeVNodeHook(vnodeHook, parentComponent, vnode);
			}
			if (dirs) invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
			const needCallTransitionHooks = needTransition(parentSuspense, transition);
			if (needCallTransitionHooks) transition.beforeEnter(el);
			hostInsert(el, container, anchor);
			if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) queuePostRenderEffect(() => {
				try {
					vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
					needCallTransitionHooks && transition.enter(el);
					dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
				} finally {}
			}, parentSuspense);
		};
		const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
			if (scopeId) hostSetScopeId(el, scopeId);
			if (slotScopeIds) for (let i = 0; i < slotScopeIds.length; i++) hostSetScopeId(el, slotScopeIds[i]);
			if (parentComponent) {
				let subTree = parentComponent.subTree;
				if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
					const parentVNode = parentComponent.vnode;
					setScopeId(el, parentVNode, parentVNode.scopeId, parentVNode.slotScopeIds, parentComponent.parent);
				}
			}
		};
		const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
			for (let i = start; i < children.length; i++) {
				const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
				patch(null, child, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			}
		};
		const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			const el = n2.el = n1.el;
			let { patchFlag, dynamicChildren, dirs } = n2;
			patchFlag |= n1.patchFlag & 16;
			const oldProps = n1.props || EMPTY_OBJ;
			const newProps = n2.props || EMPTY_OBJ;
			let vnodeHook;
			parentComponent && toggleRecurse(parentComponent, false);
			if (vnodeHook = newProps.onVnodeBeforeUpdate) invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
			if (dirs) invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
			parentComponent && toggleRecurse(parentComponent, true);
			if (dynamicChildren && (!n1.dynamicChildren || n1.dynamicChildren.length !== dynamicChildren.length)) {
				patchFlag = 0;
				optimized = false;
				dynamicChildren = null;
			}
			if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) hostSetElementText(el, "");
			if (dynamicChildren) patchBlockChildren(n1.dynamicChildren, dynamicChildren, el, parentComponent, parentSuspense, resolveChildrenNamespace(n2, namespace), slotScopeIds);
			else if (!optimized) patchChildren(n1, n2, el, null, parentComponent, parentSuspense, resolveChildrenNamespace(n2, namespace), slotScopeIds, false);
			if (patchFlag > 0) {
				if (patchFlag & 16) patchProps(el, oldProps, newProps, parentComponent, namespace);
				else {
					if (patchFlag & 2) {
						if (oldProps.class !== newProps.class) hostPatchProp(el, "class", null, newProps.class, namespace);
					}
					if (patchFlag & 4) hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
					if (patchFlag & 8) {
						const propsToUpdate = n2.dynamicProps;
						for (let i = 0; i < propsToUpdate.length; i++) {
							const key = propsToUpdate[i];
							const prev = oldProps[key];
							const next = newProps[key];
							if (next !== prev || key === "value") hostPatchProp(el, key, prev, next, namespace, parentComponent);
						}
					}
				}
				if (patchFlag & 1) {
					if (n1.children !== n2.children) hostSetElementText(el, n2.children);
				}
			} else if (!optimized && dynamicChildren == null) patchProps(el, oldProps, newProps, parentComponent, namespace);
			if ((vnodeHook = newProps.onVnodeUpdated) || dirs) queuePostRenderEffect(() => {
				vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
				dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
			}, parentSuspense);
		};
		const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
			for (let i = 0; i < newChildren.length; i++) {
				const oldVNode = oldChildren[i];
				const newVNode = newChildren[i];
				const container = oldVNode.el && (oldVNode.type === Fragment || !isSameVNodeType(oldVNode, newVNode) || oldVNode.shapeFlag & 198) ? hostParentNode(oldVNode.el) : fallbackContainer;
				patch(oldVNode, newVNode, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, true);
			}
		};
		const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
			if (oldProps !== newProps) {
				if (oldProps !== EMPTY_OBJ) {
					for (const key in oldProps) if (!isReservedProp(key) && !(key in newProps)) hostPatchProp(el, key, oldProps[key], null, namespace, parentComponent);
				}
				for (const key in newProps) {
					if (isReservedProp(key)) continue;
					const next = newProps[key];
					const prev = oldProps[key];
					if (next !== prev && key !== "value") hostPatchProp(el, key, prev, next, namespace, parentComponent);
				}
				if ("value" in newProps) hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
			}
		};
		const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
			const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
			let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
			if (fragmentSlotScopeIds) slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
			if (n1 == null) {
				hostInsert(fragmentStartAnchor, container, anchor);
				hostInsert(fragmentEndAnchor, container, anchor);
				mountChildren(n2.children || [], container, fragmentEndAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			} else if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
				patchBlockChildren(n1.dynamicChildren, dynamicChildren, container, parentComponent, parentSuspense, namespace, slotScopeIds);
				if (n2.key != null || parentComponent && n2 === parentComponent.subTree) traverseStaticChildren(n1, n2, true);
			} else patchChildren(n1, n2, container, fragmentEndAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
		};
		const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			n2.slotScopeIds = slotScopeIds;
			if (n1 == null) if (n2.shapeFlag & 512) parentComponent.ctx.activate(n2, container, anchor, namespace, optimized);
			else mountComponent(n2, container, anchor, parentComponent, parentSuspense, namespace, optimized);
			else updateComponent(n1, n2, optimized);
		};
		const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
			const instance = initialVNode.component = createComponentInstance(initialVNode, parentComponent, parentSuspense);
			if (isKeepAlive(initialVNode)) instance.ctx.renderer = internals;
			setupComponent(instance, false, optimized);
			if (instance.asyncDep) {
				parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
				if (!initialVNode.el) {
					const placeholder = instance.subTree = createVNode(Comment);
					processCommentNode(null, placeholder, container, anchor);
					initialVNode.placeholder = placeholder.el;
				}
			} else setupRenderEffect(instance, initialVNode, container, anchor, parentSuspense, namespace, optimized);
		};
		const updateComponent = (n1, n2, optimized) => {
			const instance = n2.component = n1.component;
			if (shouldUpdateComponent(n1, n2, optimized)) if (instance.asyncDep && !instance.asyncResolved) {
				updateComponentPreRender(instance, n2, optimized);
				return;
			} else {
				instance.next = n2;
				instance.update();
			}
			else {
				n2.el = n1.el;
				instance.vnode = n2;
			}
		};
		const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
			const componentUpdateFn = () => {
				if (!instance.isMounted) {
					let vnodeHook;
					const { el, props } = initialVNode;
					const { bm, m, parent, root, type } = instance;
					const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
					toggleRecurse(instance, false);
					if (bm) invokeArrayFns(bm);
					if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) invokeVNodeHook(vnodeHook, parent, initialVNode);
					toggleRecurse(instance, true);
					if (el && hydrateNode) {
						const hydrateSubTree = () => {
							instance.subTree = renderComponentRoot(instance);
							hydrateNode(el, instance.subTree, instance, parentSuspense, null);
						};
						if (isAsyncWrapperVNode && type.__asyncHydrate) type.__asyncHydrate(el, instance, hydrateSubTree);
						else hydrateSubTree();
					} else {
						if (root.ce && root.ce._hasShadowRoot()) root.ce._injectChildStyle(type, instance.parent ? instance.parent.type : void 0);
						const subTree = instance.subTree = renderComponentRoot(instance);
						patch(null, subTree, container, anchor, instance, parentSuspense, namespace);
						initialVNode.el = subTree.el;
					}
					if (m) queuePostRenderEffect(m, parentSuspense);
					if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
						const scopedInitialVNode = initialVNode;
						queuePostRenderEffect(() => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode), parentSuspense);
					}
					if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) instance.a && queuePostRenderEffect(instance.a, parentSuspense);
					instance.isMounted = true;
					initialVNode = container = anchor = null;
				} else {
					let { next, bu, u, parent, vnode } = instance;
					{
						const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
						if (nonHydratedAsyncRoot) {
							if (next) {
								next.el = vnode.el;
								updateComponentPreRender(instance, next, optimized);
							}
							nonHydratedAsyncRoot.asyncDep.then(() => {
								queuePostRenderEffect(() => {
									if (!instance.isUnmounted) update();
								}, parentSuspense);
							});
							return;
						}
					}
					let originNext = next;
					let vnodeHook;
					toggleRecurse(instance, false);
					if (next) {
						next.el = vnode.el;
						updateComponentPreRender(instance, next, optimized);
					} else next = vnode;
					if (bu) invokeArrayFns(bu);
					if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) invokeVNodeHook(vnodeHook, parent, next, vnode);
					toggleRecurse(instance, true);
					const nextTree = renderComponentRoot(instance);
					const prevTree = instance.subTree;
					instance.subTree = nextTree;
					patch(prevTree, nextTree, hostParentNode(prevTree.el), getNextHostNode(prevTree), instance, parentSuspense, namespace);
					next.el = nextTree.el;
					if (originNext === null) updateHOCHostEl(instance, nextTree.el);
					if (u) queuePostRenderEffect(u, parentSuspense);
					if (vnodeHook = next.props && next.props.onVnodeUpdated) queuePostRenderEffect(() => invokeVNodeHook(vnodeHook, parent, next, vnode), parentSuspense);
				}
			};
			instance.scope.on();
			const effect = instance.effect = new ReactiveEffect(componentUpdateFn);
			instance.scope.off();
			const update = instance.update = effect.run.bind(effect);
			const job = instance.job = effect.runIfDirty.bind(effect);
			job.i = instance;
			job.id = instance.uid;
			effect.scheduler = () => queueJob(job);
			toggleRecurse(instance, true);
			update();
		};
		const updateComponentPreRender = (instance, nextVNode, optimized) => {
			nextVNode.component = instance;
			const prevProps = instance.vnode.props;
			instance.vnode = nextVNode;
			instance.next = null;
			updateProps(instance, nextVNode.props, prevProps, optimized);
			updateSlots(instance, nextVNode.children, optimized);
			pauseTracking();
			flushPreFlushCbs(instance);
			resetTracking();
		};
		const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
			const c1 = n1 && n1.children;
			const prevShapeFlag = n1 ? n1.shapeFlag : 0;
			const c2 = n2.children;
			const { patchFlag, shapeFlag } = n2;
			if (patchFlag > 0) {
				if (patchFlag & 128) {
					patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
					return;
				} else if (patchFlag & 256) {
					patchUnkeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
					return;
				}
			}
			if (shapeFlag & 8) {
				if (prevShapeFlag & 16) unmountChildren(c1, parentComponent, parentSuspense);
				if (c2 !== c1) hostSetElementText(container, c2);
			} else if (prevShapeFlag & 16) if (shapeFlag & 16) patchKeyedChildren(c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			else unmountChildren(c1, parentComponent, parentSuspense, true);
			else {
				if (prevShapeFlag & 8) hostSetElementText(container, "");
				if (shapeFlag & 16) mountChildren(c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			}
		};
		const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			c1 = c1 || EMPTY_ARR;
			c2 = c2 || EMPTY_ARR;
			const oldLength = c1.length;
			const newLength = c2.length;
			const commonLength = Math.min(oldLength, newLength);
			let i;
			for (i = 0; i < commonLength; i++) {
				const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
				patch(c1[i], nextChild, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
			}
			if (oldLength > newLength) unmountChildren(c1, parentComponent, parentSuspense, true, false, commonLength);
			else mountChildren(c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, commonLength);
		};
		const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
			let i = 0;
			const l2 = c2.length;
			let e1 = c1.length - 1;
			let e2 = l2 - 1;
			while (i <= e1 && i <= e2) {
				const n1 = c1[i];
				const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
				if (isSameVNodeType(n1, n2)) patch(n1, n2, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				else break;
				i++;
			}
			while (i <= e1 && i <= e2) {
				const n1 = c1[e1];
				const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
				if (isSameVNodeType(n1, n2)) patch(n1, n2, container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
				else break;
				e1--;
				e2--;
			}
			if (i > e1) {
				if (i <= e2) {
					const nextPos = e2 + 1;
					const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
					while (i <= e2) {
						patch(null, c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]), container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
						i++;
					}
				}
			} else if (i > e2) while (i <= e1) {
				unmount(c1[i], parentComponent, parentSuspense, true);
				i++;
			}
			else {
				const s1 = i;
				const s2 = i;
				const keyToNewIndexMap = /* @__PURE__ */ new Map();
				for (i = s2; i <= e2; i++) {
					const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
					if (nextChild.key != null) keyToNewIndexMap.set(nextChild.key, i);
				}
				let j;
				let patched = 0;
				const toBePatched = e2 - s2 + 1;
				let moved = false;
				let maxNewIndexSoFar = 0;
				const newIndexToOldIndexMap = new Array(toBePatched);
				for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
				for (i = s1; i <= e1; i++) {
					const prevChild = c1[i];
					if (patched >= toBePatched) {
						unmount(prevChild, parentComponent, parentSuspense, true);
						continue;
					}
					let newIndex;
					if (prevChild.key != null) newIndex = keyToNewIndexMap.get(prevChild.key);
					else for (j = s2; j <= e2; j++) if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
						newIndex = j;
						break;
					}
					if (newIndex === void 0) unmount(prevChild, parentComponent, parentSuspense, true);
					else {
						newIndexToOldIndexMap[newIndex - s2] = i + 1;
						if (newIndex >= maxNewIndexSoFar) maxNewIndexSoFar = newIndex;
						else moved = true;
						patch(prevChild, c2[newIndex], container, null, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
						patched++;
					}
				}
				const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
				j = increasingNewIndexSequence.length - 1;
				for (i = toBePatched - 1; i >= 0; i--) {
					const nextIndex = s2 + i;
					const nextChild = c2[nextIndex];
					const anchorVNode = c2[nextIndex + 1];
					const anchor = nextIndex + 1 < l2 ? anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode) : parentAnchor;
					if (newIndexToOldIndexMap[i] === 0) patch(null, nextChild, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized);
					else if (moved) if (j < 0 || i !== increasingNewIndexSequence[j]) move(nextChild, container, anchor, 2);
					else j--;
				}
			}
		};
		const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
			const { el, type, transition, children, shapeFlag } = vnode;
			if (shapeFlag & 6) {
				move(vnode.component.subTree, container, anchor, moveType);
				return;
			}
			if (shapeFlag & 128) {
				vnode.suspense.move(container, anchor, moveType);
				return;
			}
			if (shapeFlag & 64) {
				type.move(vnode, container, anchor, internals);
				return;
			}
			if (type === Fragment) {
				hostInsert(el, container, anchor);
				for (let i = 0; i < children.length; i++) move(children[i], container, anchor, moveType);
				hostInsert(vnode.anchor, container, anchor);
				return;
			}
			if (type === Static) {
				moveStaticNode(vnode, container, anchor);
				return;
			}
			if (moveType !== 2 && shapeFlag & 1 && transition) if (moveType === 0) if (transition.persisted && !el[leaveCbKey]) hostInsert(el, container, anchor);
			else {
				transition.beforeEnter(el);
				hostInsert(el, container, anchor);
				queuePostRenderEffect(() => transition.enter(el), parentSuspense);
			}
			else {
				const { leave, delayLeave, afterLeave } = transition;
				const remove2 = () => {
					if (vnode.ctx.isUnmounted) hostRemove(el);
					else hostInsert(el, container, anchor);
				};
				const performLeave = () => {
					const wasLeaving = el._isLeaving || !!el[leaveCbKey];
					if (el._isLeaving) el[leaveCbKey](true);
					if (transition.persisted && !wasLeaving) remove2();
					else leave(el, () => {
						remove2();
						afterLeave && afterLeave();
					});
				};
				if (delayLeave) delayLeave(el, remove2, performLeave);
				else performLeave();
			}
			else hostInsert(el, container, anchor);
		};
		const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
			const { type, props, ref, children, dynamicChildren, shapeFlag, patchFlag, dirs, cacheIndex, memo } = vnode;
			if (patchFlag === -2) optimized = false;
			if (ref != null) {
				pauseTracking();
				setRef(ref, null, parentSuspense, vnode, true);
				resetTracking();
			}
			if (cacheIndex != null) parentComponent.renderCache[cacheIndex] = void 0;
			if (shapeFlag & 256) {
				parentComponent.ctx.deactivate(vnode);
				return;
			}
			const shouldInvokeDirs = shapeFlag & 1 && dirs;
			const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
			let vnodeHook;
			if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) invokeVNodeHook(vnodeHook, parentComponent, vnode);
			if (shapeFlag & 6) unmountComponent(vnode.component, parentSuspense, doRemove);
			else {
				if (shapeFlag & 128) {
					vnode.suspense.unmount(parentSuspense, doRemove);
					return;
				}
				if (shouldInvokeDirs) invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
				if (shapeFlag & 64) vnode.type.remove(vnode, parentComponent, parentSuspense, internals, doRemove);
				else if (dynamicChildren && !dynamicChildren.hasOnce && (type !== Fragment || patchFlag > 0 && patchFlag & 64)) unmountChildren(dynamicChildren, parentComponent, parentSuspense, false, true);
				else if (type === Fragment && patchFlag & 384 || !optimized && shapeFlag & 16) unmountChildren(children, parentComponent, parentSuspense);
				if (doRemove) remove(vnode);
			}
			const shouldInvalidateMemo = memo != null && cacheIndex == null;
			if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) queuePostRenderEffect(() => {
				vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
				shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
				if (shouldInvalidateMemo) vnode.el = null;
			}, parentSuspense);
		};
		const remove = (vnode) => {
			const { type, el, anchor, transition } = vnode;
			if (type === Fragment) {
				removeFragment(el, anchor);
				return;
			}
			if (type === Static) {
				removeStaticNode(vnode);
				return;
			}
			const performRemove = () => {
				hostRemove(el);
				if (transition && !transition.persisted && transition.afterLeave) transition.afterLeave();
			};
			if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
				const { leave, delayLeave } = transition;
				const performLeave = () => leave(el, performRemove);
				if (delayLeave) delayLeave(vnode.el, performRemove, performLeave);
				else performLeave();
			} else performRemove();
		};
		const removeFragment = (cur, end) => {
			let next;
			while (cur !== end) {
				next = hostNextSibling(cur);
				hostRemove(cur);
				cur = next;
			}
			hostRemove(end);
		};
		const unmountComponent = (instance, parentSuspense, doRemove) => {
			const { bum, scope, job, subTree, um, m, a } = instance;
			invalidateMount(m);
			invalidateMount(a);
			if (bum) invokeArrayFns(bum);
			scope.stop();
			if (job) {
				job.flags |= 8;
				unmount(subTree, instance, parentSuspense, doRemove);
			}
			if (um) queuePostRenderEffect(um, parentSuspense);
			queuePostRenderEffect(() => {
				instance.isUnmounted = true;
			}, parentSuspense);
		};
		const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
			for (let i = start; i < children.length; i++) unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
		};
		const getNextHostNode = (vnode) => {
			if (vnode.shapeFlag & 6) return getNextHostNode(vnode.component.subTree);
			if (vnode.shapeFlag & 128) return vnode.suspense.next();
			const el = hostNextSibling(vnode.anchor || vnode.el);
			const teleportEnd = el && el[TeleportEndKey];
			return teleportEnd ? hostNextSibling(teleportEnd) : el;
		};
		let isFlushing = false;
		const render = (vnode, container, namespace) => {
			let instance;
			if (vnode == null) {
				if (container._vnode) {
					unmount(container._vnode, null, null, true);
					instance = container._vnode.component;
				}
			} else patch(container._vnode || null, vnode, container, null, null, null, namespace);
			container._vnode = vnode;
			if (!isFlushing) {
				isFlushing = true;
				flushPreFlushCbs(instance);
				flushPostFlushCbs();
				isFlushing = false;
			}
		};
		const internals = {
			p: patch,
			um: unmount,
			m: move,
			r: remove,
			mt: mountComponent,
			mc: mountChildren,
			pc: patchChildren,
			pbc: patchBlockChildren,
			n: getNextHostNode,
			o: options
		};
		let hydrate;
		let hydrateNode;
		if (createHydrationFns) [hydrate, hydrateNode] = createHydrationFns(internals);
		return {
			render,
			hydrate,
			createApp: createAppAPI(render, hydrate)
		};
	}
	function resolveChildrenNamespace({ type, props }, currentNamespace) {
		return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
	}
	function toggleRecurse({ effect, job }, allowed) {
		if (allowed) {
			effect.flags |= 32;
			job.flags |= 4;
		} else {
			effect.flags &= -33;
			job.flags &= -5;
		}
	}
	function needTransition(parentSuspense, transition) {
		return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
	}
	function traverseStaticChildren(n1, n2, shallow = false) {
		const ch1 = n1.children;
		const ch2 = n2.children;
		if (isArray(ch1) && isArray(ch2)) for (let i = 0; i < ch1.length; i++) {
			const c1 = ch1[i];
			let c2 = ch2[i];
			if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
				if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
					c2 = ch2[i] = cloneIfMounted(ch2[i]);
					c2.el = c1.el;
				}
				if (!shallow && c2.patchFlag !== -2) traverseStaticChildren(c1, c2);
			}
			if (c2.type === Text) {
				if (c2.patchFlag === -1) c2 = ch2[i] = cloneIfMounted(c2);
				c2.el = c1.el;
			}
			if (c2.type === Comment && !c2.el) c2.el = c1.el;
		}
	}
	function getSequence(arr) {
		const p = arr.slice();
		const result = [0];
		let i, j, u, v, c;
		const len = arr.length;
		for (i = 0; i < len; i++) {
			const arrI = arr[i];
			if (arrI !== 0) {
				j = result[result.length - 1];
				if (arr[j] < arrI) {
					p[i] = j;
					result.push(i);
					continue;
				}
				u = 0;
				v = result.length - 1;
				while (u < v) {
					c = u + v >> 1;
					if (arr[result[c]] < arrI) u = c + 1;
					else v = c;
				}
				if (arrI < arr[result[u]]) {
					if (u > 0) p[i] = result[u - 1];
					result[u] = i;
				}
			}
		}
		u = result.length;
		v = result[u - 1];
		while (u-- > 0) {
			result[u] = v;
			v = p[v];
		}
		return result;
	}
	function locateNonHydratedAsyncRoot(instance) {
		const subComponent = instance.subTree.component;
		if (subComponent) if (subComponent.asyncDep && !subComponent.asyncResolved) return subComponent;
		else return locateNonHydratedAsyncRoot(subComponent);
	}
	function invalidateMount(hooks) {
		if (hooks) for (let i = 0; i < hooks.length; i++) hooks[i].flags |= 8;
	}
	function resolveAsyncComponentPlaceholder(anchorVnode) {
		if (anchorVnode.placeholder) return anchorVnode.placeholder;
		const instance = anchorVnode.component;
		if (instance) return resolveAsyncComponentPlaceholder(instance.subTree);
		return null;
	}
	var isSuspense = (type) => type.__isSuspense;
	function queueEffectWithSuspense(fn, suspense) {
		if (suspense && suspense.pendingBranch) if (isArray(fn)) suspense.effects.push(...fn);
		else suspense.effects.push(fn);
		else queuePostFlushCb(fn);
	}
	var Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
	var Text = /* @__PURE__ */ Symbol.for("v-txt");
	var Comment = /* @__PURE__ */ Symbol.for("v-cmt");
	var Static = /* @__PURE__ */ Symbol.for("v-stc");
	var blockStack = [];
	var currentBlock = null;
	function openBlock(disableTracking = false) {
		blockStack.push(currentBlock = disableTracking ? null : []);
	}
	function closeBlock() {
		blockStack.pop();
		currentBlock = blockStack[blockStack.length - 1] || null;
	}
	var isBlockTreeEnabled = 1;
	function setBlockTracking(value, inVOnce = false) {
		isBlockTreeEnabled += value;
		if (value < 0 && currentBlock && inVOnce) currentBlock.hasOnce = true;
	}
	function setupBlock(vnode) {
		vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
		closeBlock();
		if (isBlockTreeEnabled > 0 && currentBlock) currentBlock.push(vnode);
		return vnode;
	}
	function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
		return setupBlock(createBaseVNode(type, props, children, patchFlag, dynamicProps, shapeFlag, true));
	}
	function createBlock(type, props, children, patchFlag, dynamicProps) {
		return setupBlock(createVNode(type, props, children, patchFlag, dynamicProps, true));
	}
	function isVNode(value) {
		return value ? value.__v_isVNode === true : false;
	}
	function isSameVNodeType(n1, n2) {
		return n1.type === n2.type && n1.key === n2.key;
	}
	var normalizeKey = ({ key }) => key != null ? key : null;
	var normalizeRef = ({ ref, ref_key, ref_for }) => {
		if (typeof ref === "number") ref = "" + ref;
		return ref != null ? isString(ref) || /* @__PURE__ */ isRef(ref) || isFunction(ref) ? {
			i: currentRenderingInstance,
			r: ref,
			k: ref_key,
			f: !!ref_for
		} : ref : null;
	};
	function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
		const vnode = {
			__v_isVNode: true,
			__v_skip: true,
			type,
			props,
			key: props && normalizeKey(props),
			ref: props && normalizeRef(props),
			scopeId: currentScopeId,
			slotScopeIds: null,
			children,
			component: null,
			suspense: null,
			ssContent: null,
			ssFallback: null,
			dirs: null,
			transition: null,
			el: null,
			anchor: null,
			target: null,
			targetStart: null,
			targetAnchor: null,
			staticCount: 0,
			shapeFlag,
			patchFlag,
			dynamicProps,
			dynamicChildren: null,
			appContext: null,
			ctx: currentRenderingInstance
		};
		if (needFullChildrenNormalization) {
			normalizeChildren(vnode, children);
			if (shapeFlag & 128) type.normalize(vnode);
		} else if (children) vnode.shapeFlag |= isString(children) ? 8 : 16;
		if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock && (vnode.patchFlag > 0 || shapeFlag & 6) && vnode.patchFlag !== 32) currentBlock.push(vnode);
		return vnode;
	}
	var createVNode = _createVNode;
	function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
		if (!type || type === NULL_DYNAMIC_COMPONENT) type = Comment;
		if (isVNode(type)) {
			const cloned = cloneVNode(type, props, true);
			if (children) normalizeChildren(cloned, children);
			if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) if (cloned.shapeFlag & 6) currentBlock[currentBlock.indexOf(type)] = cloned;
			else currentBlock.push(cloned);
			cloned.patchFlag = -2;
			return cloned;
		}
		if (isClassComponent(type)) type = type.__vccOpts;
		if (props) {
			props = guardReactiveProps(props);
			let { class: klass, style } = props;
			if (klass && !isString(klass)) props.class = normalizeClass(klass);
			if (isObject(style)) {
				if (/* @__PURE__ */ isProxy(style) && !isArray(style)) style = extend({}, style);
				props.style = normalizeStyle(style);
			}
		}
		const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject(type) ? 4 : isFunction(type) ? 2 : 0;
		return createBaseVNode(type, props, children, patchFlag, dynamicProps, shapeFlag, isBlockNode, true);
	}
	function guardReactiveProps(props) {
		if (!props) return null;
		return /* @__PURE__ */ isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
	}
	function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
		const { props, ref, patchFlag, children, transition } = vnode;
		const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
		const cloned = {
			__v_isVNode: true,
			__v_skip: true,
			type: vnode.type,
			props: mergedProps,
			key: mergedProps && normalizeKey(mergedProps),
			ref: extraProps && extraProps.ref ? mergeRef && ref ? isArray(ref) ? ref.concat(normalizeRef(extraProps)) : [ref, normalizeRef(extraProps)] : normalizeRef(extraProps) : ref,
			scopeId: vnode.scopeId,
			slotScopeIds: vnode.slotScopeIds,
			children,
			target: vnode.target,
			targetStart: vnode.targetStart,
			targetAnchor: vnode.targetAnchor,
			staticCount: vnode.staticCount,
			shapeFlag: vnode.shapeFlag,
			patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
			dynamicProps: vnode.dynamicProps,
			dynamicChildren: vnode.dynamicChildren,
			appContext: vnode.appContext,
			dirs: vnode.dirs,
			transition,
			component: vnode.component,
			suspense: vnode.suspense,
			ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
			ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
			placeholder: vnode.placeholder,
			el: vnode.el,
			anchor: vnode.anchor,
			ctx: vnode.ctx,
			ce: vnode.ce
		};
		if (transition && cloneTransition) setTransitionHooks(cloned, transition.clone(cloned));
		return cloned;
	}
	function createTextVNode(text = " ", flag = 0) {
		return createVNode(Text, null, text, flag);
	}
	function createStaticVNode(content, numberOfNodes) {
		const vnode = createVNode(Static, null, content);
		vnode.staticCount = numberOfNodes;
		return vnode;
	}
	function createCommentVNode(text = "", asBlock = false) {
		return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
	}
	function normalizeVNode(child) {
		if (child == null || typeof child === "boolean") return createVNode(Comment);
		else if (isArray(child)) return createVNode(Fragment, null, child.slice());
		else if (isVNode(child)) return cloneIfMounted(child);
		else return createVNode(Text, null, String(child));
	}
	function cloneIfMounted(child) {
		return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
	}
	function normalizeChildren(vnode, children) {
		let type = 0;
		const { shapeFlag } = vnode;
		if (children == null) children = null;
		else if (isArray(children)) type = 16;
		else if (typeof children === "object") if (shapeFlag & 65) {
			const slot = children.default;
			if (slot) {
				slot._c && (slot._d = false);
				normalizeChildren(vnode, slot());
				slot._c && (slot._d = true);
			}
			return;
		} else {
			type = 32;
			const slotFlag = children._;
			if (!slotFlag && !isInternalObject(children)) children._ctx = currentRenderingInstance;
			else if (slotFlag === 3 && currentRenderingInstance) if (currentRenderingInstance.slots._ === 1) children._ = 1;
			else {
				children._ = 2;
				vnode.patchFlag |= 1024;
			}
		}
		else if (isFunction(children)) {
			if (shapeFlag & 65) {
				normalizeChildren(vnode, { default: children });
				return;
			}
			children = {
				default: children,
				_ctx: currentRenderingInstance
			};
			type = 32;
		} else {
			children = String(children);
			if (shapeFlag & 64) {
				type = 16;
				children = [createTextVNode(children)];
			} else type = 8;
		}
		vnode.children = children;
		vnode.shapeFlag |= type;
	}
	function mergeProps(...args) {
		const ret = {};
		for (let i = 0; i < args.length; i++) {
			const toMerge = args[i];
			for (const key in toMerge) if (key === "class") {
				if (ret.class !== toMerge.class) ret.class = normalizeClass([ret.class, toMerge.class]);
			} else if (key === "style") ret.style = normalizeStyle([ret.style, toMerge.style]);
			else if (isOn(key)) {
				const existing = ret[key];
				const incoming = toMerge[key];
				if (incoming && existing !== incoming && !(isArray(existing) && existing.includes(incoming))) ret[key] = existing ? [].concat(existing, incoming) : incoming;
				else if (incoming == null && existing == null && !isModelListener(key)) ret[key] = incoming;
			} else if (key !== "") ret[key] = toMerge[key];
		}
		return ret;
	}
	function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
		callWithAsyncErrorHandling(hook, instance, 7, [vnode, prevVNode]);
	}
	var emptyAppContext = createAppContext();
	var uid = 0;
	function createComponentInstance(vnode, parent, suspense) {
		const type = vnode.type;
		const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
		const instance = {
			uid: uid++,
			vnode,
			type,
			parent,
			appContext,
			root: null,
			next: null,
			subTree: null,
			effect: null,
			update: null,
			job: null,
			scope: new EffectScope(true),
			render: null,
			proxy: null,
			exposed: null,
			exposeProxy: null,
			withProxy: null,
			provides: parent ? parent.provides : Object.create(appContext.provides),
			ids: parent ? parent.ids : [
				"",
				0,
				0
			],
			accessCache: null,
			renderCache: [],
			components: null,
			directives: null,
			propsOptions: normalizePropsOptions(type, appContext),
			emitsOptions: normalizeEmitsOptions(type, appContext),
			emit: null,
			emitted: null,
			propsDefaults: EMPTY_OBJ,
			inheritAttrs: type.inheritAttrs,
			ctx: EMPTY_OBJ,
			data: EMPTY_OBJ,
			props: EMPTY_OBJ,
			attrs: EMPTY_OBJ,
			slots: EMPTY_OBJ,
			refs: EMPTY_OBJ,
			setupState: EMPTY_OBJ,
			setupContext: null,
			suspense,
			suspenseId: suspense ? suspense.pendingId : 0,
			asyncDep: null,
			asyncResolved: false,
			isMounted: false,
			isUnmounted: false,
			isDeactivated: false,
			bc: null,
			c: null,
			bm: null,
			m: null,
			bu: null,
			u: null,
			um: null,
			bum: null,
			da: null,
			a: null,
			rtg: null,
			rtc: null,
			ec: null,
			sp: null
		};
		instance.ctx = { _: instance };
		instance.root = parent ? parent.root : instance;
		instance.emit = emit.bind(null, instance);
		if (vnode.ce) vnode.ce(instance);
		return instance;
	}
	var currentInstance = null;
	var getCurrentInstance = () => currentInstance || currentRenderingInstance;
	var internalSetCurrentInstance;
	var setInSSRSetupState;
	{
		const g = getGlobalThis();
		const registerGlobalSetter = (key, setter) => {
			let setters;
			if (!(setters = g[key])) setters = g[key] = [];
			setters.push(setter);
			return (v) => {
				if (setters.length > 1) setters.forEach((set) => set(v));
				else setters[0](v);
			};
		};
		internalSetCurrentInstance = registerGlobalSetter(`__VUE_INSTANCE_SETTERS__`, (v) => currentInstance = v);
		setInSSRSetupState = registerGlobalSetter(`__VUE_SSR_SETTERS__`, (v) => isInSSRComponentSetup = v);
	}
	var setCurrentInstance = (instance) => {
		const prev = currentInstance;
		internalSetCurrentInstance(instance);
		instance.scope.on();
		return () => {
			instance.scope.off();
			internalSetCurrentInstance(prev);
		};
	};
	var unsetCurrentInstance = () => {
		currentInstance && currentInstance.scope.off();
		internalSetCurrentInstance(null);
	};
	function isStatefulComponent(instance) {
		return instance.vnode.shapeFlag & 4;
	}
	var isInSSRComponentSetup = false;
	function setupComponent(instance, isSSR = false, optimized = false) {
		isSSR && setInSSRSetupState(isSSR);
		const { props, children } = instance.vnode;
		const isStateful = isStatefulComponent(instance);
		initProps(instance, props, isStateful, isSSR);
		initSlots(instance, children, optimized || isSSR);
		const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
		isSSR && setInSSRSetupState(false);
		return setupResult;
	}
	function setupStatefulComponent(instance, isSSR) {
		const Component = instance.type;
		instance.accessCache = /* @__PURE__ */ Object.create(null);
		instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
		const { setup } = Component;
		if (setup) {
			pauseTracking();
			const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
			const reset = setCurrentInstance(instance);
			const setupResult = callWithErrorHandling(setup, instance, 0, [instance.props, setupContext]);
			const isAsyncSetup = isPromise(setupResult);
			resetTracking();
			reset();
			if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) markAsyncBoundary(instance);
			if (isAsyncSetup) {
				setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
				if (isSSR) return setupResult.then((resolvedResult) => {
					handleSetupResult(instance, resolvedResult, isSSR);
				}).catch((e) => {
					handleError(e, instance, 0);
				});
				else instance.asyncDep = setupResult;
			} else handleSetupResult(instance, setupResult, isSSR);
		} else finishComponentSetup(instance, isSSR);
	}
	function handleSetupResult(instance, setupResult, isSSR) {
		if (isFunction(setupResult)) if (instance.type.__ssrInlineRender) instance.ssrRender = setupResult;
		else instance.render = setupResult;
		else if (isObject(setupResult)) instance.setupState = proxyRefs(setupResult);
		finishComponentSetup(instance, isSSR);
	}
	var compile;
	var installWithProxy;
	function finishComponentSetup(instance, isSSR, skipOptions) {
		const Component = instance.type;
		if (!instance.render) {
			if (!isSSR && compile && !Component.render) {
				const template = Component.template || resolveMergedOptions(instance).template;
				if (template) {
					const { isCustomElement, compilerOptions } = instance.appContext.config;
					const { delimiters, compilerOptions: componentCompilerOptions } = Component;
					Component.render = compile(template, extend(extend({
						isCustomElement,
						delimiters
					}, compilerOptions), componentCompilerOptions));
				}
			}
			instance.render = Component.render || NOOP;
			if (installWithProxy) installWithProxy(instance);
		}
		{
			const reset = setCurrentInstance(instance);
			pauseTracking();
			try {
				applyOptions(instance);
			} finally {
				resetTracking();
				reset();
			}
		}
	}
	var attrsProxyHandlers = { get(target, key) {
		track(target, "get", "");
		return target[key];
	} };
	function createSetupContext(instance) {
		const expose = (exposed) => {
			instance.exposed = exposed || {};
		};
		return {
			attrs: new Proxy(instance.attrs, attrsProxyHandlers),
			slots: instance.slots,
			emit: instance.emit,
			expose
		};
	}
	function getComponentPublicInstance(instance) {
		if (instance.exposed) return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
			get(target, key) {
				if (key in target) return target[key];
				else if (key in publicPropertiesMap) return publicPropertiesMap[key](instance);
			},
			has(target, key) {
				return key in target || key in publicPropertiesMap;
			}
		}));
		else return instance.proxy;
	}
	function getComponentName(Component, includeInferred = true) {
		return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
	}
	function isClassComponent(value) {
		return isFunction(value) && "__vccOpts" in value;
	}
	var computed = (getterOrOptions, debugOptions) => {
		return /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
	};
	var version = "3.5.40";
	//#endregion
	//#region node_modules/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js
	/**
	* @vue/runtime-dom v3.5.40
	* (c) 2018-present Yuxi (Evan) You and Vue contributors
	* @license MIT
	**/
	var policy = void 0;
	var tt = typeof window !== "undefined" && window.trustedTypes;
	if (tt) try {
		policy = /* @__PURE__ */ tt.createPolicy("vue", { createHTML: (val) => val });
	} catch (e) {}
	var unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
	var svgNS = "http://www.w3.org/2000/svg";
	var mathmlNS = "http://www.w3.org/1998/Math/MathML";
	var doc = typeof document !== "undefined" ? document : null;
	var templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
	var nodeOps = {
		insert: (child, parent, anchor) => {
			parent.insertBefore(child, anchor || null);
		},
		remove: (child) => {
			const parent = child.parentNode;
			if (parent) parent.removeChild(child);
		},
		createElement: (tag, namespace, is, props) => {
			const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
			if (tag === "select" && props && props.multiple != null) el.setAttribute("multiple", props.multiple);
			return el;
		},
		createText: (text) => doc.createTextNode(text),
		createComment: (text) => doc.createComment(text),
		setText: (node, text) => {
			node.nodeValue = text;
		},
		setElementText: (el, text) => {
			el.textContent = text;
		},
		parentNode: (node) => node.parentNode,
		nextSibling: (node) => node.nextSibling,
		querySelector: (selector) => doc.querySelector(selector),
		setScopeId(el, id) {
			el.setAttribute(id, "");
		},
		insertStaticContent(content, parent, anchor, namespace, start, end) {
			const before = anchor ? anchor.previousSibling : parent.lastChild;
			if (start && (start === end || start.nextSibling)) while (true) {
				parent.insertBefore(start.cloneNode(true), anchor);
				if (start === end || !(start = start.nextSibling)) break;
			}
			else {
				templateContainer.innerHTML = unsafeToTrustedHTML(namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content);
				const template = templateContainer.content;
				if (namespace === "svg" || namespace === "mathml") {
					const wrapper = template.firstChild;
					while (wrapper.firstChild) template.appendChild(wrapper.firstChild);
					template.removeChild(wrapper);
				}
				parent.insertBefore(template, anchor);
			}
			return [before ? before.nextSibling : parent.firstChild, anchor ? anchor.previousSibling : parent.lastChild];
		}
	};
	var vtcKey = /* @__PURE__ */ Symbol("_vtc");
	function patchClass(el, value, isSVG) {
		const transitionClasses = el[vtcKey];
		if (transitionClasses) value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
		if (value == null) el.removeAttribute("class");
		else if (isSVG) el.setAttribute("class", value);
		else el.className = value;
	}
	var vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
	var vShowHidden = /* @__PURE__ */ Symbol("_vsh");
	var vShow = {
		name: "show",
		beforeMount(el, { value }, { transition }) {
			el[vShowOriginalDisplay] = el.style.display === "none" ? "" : el.style.display;
			if (transition && value) transition.beforeEnter(el);
			else setDisplay(el, value);
		},
		mounted(el, { value }, { transition }) {
			if (transition && value) transition.enter(el);
		},
		updated(el, { value, oldValue }, { transition }) {
			if (!value === !oldValue) return;
			if (transition) if (value) {
				transition.beforeEnter(el);
				setDisplay(el, true);
				transition.enter(el);
			} else transition.leave(el, () => {
				setDisplay(el, false);
			});
			else setDisplay(el, value);
		},
		beforeUnmount(el, { value }) {
			setDisplay(el, value);
		}
	};
	function setDisplay(el, value) {
		el.style.display = value ? el[vShowOriginalDisplay] : "none";
		el[vShowHidden] = !value;
	}
	var CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
	var displayRE = /(?:^|;)\s*display\s*:/;
	function patchStyle(el, prev, next) {
		const style = el.style;
		const isCssString = isString(next);
		let hasControlledDisplay = false;
		if (next && !isCssString) {
			if (prev) if (!isString(prev)) {
				for (const key in prev) if (next[key] == null) setStyle(style, key, "");
			} else for (const prevStyle of prev.split(";")) {
				const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
				if (next[key] == null) setStyle(style, key, "");
			}
			for (const key in next) {
				if (key === "display") hasControlledDisplay = true;
				const value = next[key];
				if (value != null) {
					if (!shouldPreserveTextareaResizeStyle(el, key, !isString(prev) && prev ? prev[key] : void 0, value)) setStyle(style, key, value);
				} else setStyle(style, key, "");
			}
		} else if (isCssString) {
			if (prev !== next) {
				const cssVarText = style[CSS_VAR_TEXT];
				if (cssVarText) next += ";" + cssVarText;
				style.cssText = next;
				hasControlledDisplay = displayRE.test(next);
			}
		} else if (prev) el.removeAttribute("style");
		if (vShowOriginalDisplay in el) {
			el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
			if (el[vShowHidden]) style.display = "none";
		}
	}
	var importantRE = /\s*!important$/;
	function setStyle(style, name, val) {
		if (isArray(val)) val.forEach((v) => setStyle(style, name, v));
		else {
			if (val == null) val = "";
			if (name.startsWith("--")) style.setProperty(name, val);
			else {
				const prefixed = autoPrefix(style, name);
				if (importantRE.test(val)) style.setProperty(hyphenate(prefixed), val.replace(importantRE, ""), "important");
				else style[prefixed] = val;
			}
		}
	}
	var prefixes = [
		"Webkit",
		"Moz",
		"ms"
	];
	var prefixCache = {};
	function autoPrefix(style, rawName) {
		const cached = prefixCache[rawName];
		if (cached) return cached;
		let name = camelize(rawName);
		if (name !== "filter" && name in style) return prefixCache[rawName] = name;
		name = capitalize(name);
		for (let i = 0; i < prefixes.length; i++) {
			const prefixed = prefixes[i] + name;
			if (prefixed in style) return prefixCache[rawName] = prefixed;
		}
		return rawName;
	}
	function shouldPreserveTextareaResizeStyle(el, key, prev, next) {
		return el.tagName === "TEXTAREA" && (key === "width" || key === "height") && isString(next) && prev === next;
	}
	var xlinkNS = "http://www.w3.org/1999/xlink";
	function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
		if (isSVG && key.startsWith("xlink:")) if (value == null) el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
		else el.setAttributeNS(xlinkNS, key, value);
		else if (value == null || isBoolean && !includeBooleanAttr(value)) el.removeAttribute(key);
		else el.setAttribute(key, isBoolean ? "" : isSymbol(value) ? String(value) : value);
	}
	function patchDOMProp(el, key, value, parentComponent, attrName) {
		if (key === "innerHTML" || key === "textContent") {
			if (value != null) el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
			return;
		}
		const tag = el.tagName;
		if (key === "value" && tag !== "PROGRESS" && !tag.includes("-")) {
			const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
			const newValue = value == null ? el.type === "checkbox" ? "on" : "" : String(value);
			if (oldValue !== newValue || !("_value" in el)) el.value = newValue;
			if (value == null) el.removeAttribute(key);
			el._value = value;
			return;
		}
		let needRemove = false;
		if (value === "" || value == null) {
			const type = typeof el[key];
			if (type === "boolean") value = includeBooleanAttr(value);
			else if (value == null && type === "string") {
				value = "";
				needRemove = true;
			} else if (type === "number") {
				value = 0;
				needRemove = true;
			}
		}
		try {
			el[key] = value;
		} catch (e) {}
		needRemove && el.removeAttribute(attrName || key);
	}
	function addEventListener(el, event, handler, options) {
		el.addEventListener(event, handler, options);
	}
	function removeEventListener(el, event, handler, options) {
		el.removeEventListener(event, handler, options);
	}
	var veiKey = /* @__PURE__ */ Symbol("_vei");
	function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
		const invokers = el[veiKey] || (el[veiKey] = {});
		const existingInvoker = invokers[rawName];
		if (nextValue && existingInvoker) existingInvoker.value = nextValue;
		else {
			const [name, options] = parseName(rawName);
			if (nextValue) addEventListener(el, name, invokers[rawName] = createInvoker(nextValue, instance), options);
			else if (existingInvoker) {
				removeEventListener(el, name, existingInvoker, options);
				invokers[rawName] = void 0;
			}
		}
	}
	var optionsModifierRE = /(Once|Passive|Capture)$/;
	var optionsModifierEventRE = /^on:?(?:Once|Passive|Capture)$/;
	function parseName(name) {
		let options;
		let m;
		while ((m = name.match(optionsModifierRE)) && !optionsModifierEventRE.test(name)) {
			if (!options) options = {};
			name = name.slice(0, name.length - m[1].length);
			options[m[1].toLowerCase()] = true;
		}
		return [name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2)), options];
	}
	var cachedNow = 0;
	var p = /* @__PURE__ */ Promise.resolve();
	var getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
	function createInvoker(initialValue, instance) {
		const invoker = (e) => {
			if (!e._vts) e._vts = Date.now();
			else if (e._vts <= invoker.attached) return;
			const value = invoker.value;
			if (isArray(value)) {
				const originalStop = e.stopImmediatePropagation;
				e.stopImmediatePropagation = () => {
					originalStop.call(e);
					e._stopped = true;
				};
				const handlers = value.slice();
				const args = [e];
				for (let i = 0; i < handlers.length; i++) {
					if (e._stopped) break;
					const handler = handlers[i];
					if (handler) callWithAsyncErrorHandling(handler, instance, 5, args);
				}
			} else callWithAsyncErrorHandling(value, instance, 5, [e]);
		};
		invoker.value = initialValue;
		invoker.attached = getNow();
		return invoker;
	}
	var isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
	var patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
		const isSVG = namespace === "svg";
		if (key === "class") patchClass(el, nextValue, isSVG);
		else if (key === "style") patchStyle(el, prevValue, nextValue);
		else if (isOn(key)) {
			if (!isModelListener(key)) patchEvent(el, key, prevValue, nextValue, parentComponent);
		} else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
			patchDOMProp(el, key, nextValue);
			if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
		} else if (el._isVueCE && (shouldSetAsPropForVueCE(el, key) || el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))) patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
		else {
			if (key === "true-value") el._trueValue = nextValue;
			else if (key === "false-value") el._falseValue = nextValue;
			patchAttr(el, key, nextValue, isSVG);
		}
	};
	function shouldSetAsProp(el, key, value, isSVG) {
		if (isSVG) {
			if (key === "innerHTML" || key === "textContent") return true;
			if (key in el && isNativeOn(key) && isFunction(value)) return true;
			return false;
		}
		if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") return false;
		if (key === "sandbox" && el.tagName === "IFRAME") return false;
		if (key === "form") return false;
		if (key === "list" && el.tagName === "INPUT") return false;
		if (key === "type" && el.tagName === "TEXTAREA") return false;
		if (key === "width" || key === "height") {
			const tag = el.tagName;
			if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") return false;
		}
		if (isNativeOn(key) && isString(value)) return false;
		return key in el;
	}
	function shouldSetAsPropForVueCE(el, key) {
		const props = el._def.props;
		if (!props) return false;
		const camelKey = camelize(key);
		return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
	}
	var getModelAssigner = (vnode) => {
		const fn = vnode.props["onUpdate:modelValue"] || false;
		return isArray(fn) ? (value) => invokeArrayFns(fn, value) : fn;
	};
	function onCompositionStart(e) {
		e.target.composing = true;
	}
	function onCompositionEnd(e) {
		const target = e.target;
		if (target.composing) {
			target.composing = false;
			target.dispatchEvent(new Event("input"));
		}
	}
	var assignKey = /* @__PURE__ */ Symbol("_assign");
	function castValue(value, trim, number) {
		if (trim) value = value.trim();
		if (number) value = looseToNumber(value);
		return value;
	}
	var vModelText = {
		created(el, { modifiers: { lazy, trim, number } }, vnode) {
			el[assignKey] = getModelAssigner(vnode);
			const castToNumber = number || vnode.props && vnode.props.type === "number";
			addEventListener(el, lazy ? "change" : "input", (e) => {
				if (e.target.composing) return;
				el[assignKey](castValue(el.value, trim, castToNumber));
			});
			if (trim || castToNumber) addEventListener(el, "change", () => {
				el.value = castValue(el.value, trim, castToNumber);
			});
			if (!lazy) {
				addEventListener(el, "compositionstart", onCompositionStart);
				addEventListener(el, "compositionend", onCompositionEnd);
				addEventListener(el, "change", onCompositionEnd);
			}
		},
		mounted(el, { value }) {
			el.value = value == null ? "" : value;
		},
		beforeUpdate(el, { value, oldValue, modifiers: { lazy, trim, number } }, vnode) {
			el[assignKey] = getModelAssigner(vnode);
			if (el.composing) return;
			const elValue = (number || el.type === "number") && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
			const newValue = value == null ? "" : value;
			if (elValue === newValue) return;
			const rootNode = el.getRootNode();
			if ((rootNode instanceof Document || rootNode instanceof ShadowRoot) && rootNode.activeElement === el && el.type !== "range") {
				if (lazy && value === oldValue) return;
				if (trim && el.value.trim() === newValue) return;
			}
			el.value = newValue;
		}
	};
	var vModelSelect = {
		deep: true,
		created(el, { value, modifiers: { number } }, vnode) {
			el._modelValue = value;
			addEventListener(el, "change", () => {
				const selectedVal = Array.prototype.filter.call(el.options, (o) => o.selected).map((o) => number ? looseToNumber(getValue(o)) : getValue(o));
				el[assignKey](el.multiple ? isSet(el._modelValue) ? new Set(selectedVal) : selectedVal : selectedVal[0]);
				el._assigning = true;
				nextTick(() => {
					el._assigning = false;
				});
			});
			el[assignKey] = getModelAssigner(vnode);
		},
		mounted(el, { value }) {
			setSelected(el, value);
		},
		beforeUpdate(el, { value }, vnode) {
			el._modelValue = value;
			el[assignKey] = getModelAssigner(vnode);
		},
		updated(el, { value }) {
			if (!el._assigning) setSelected(el, value);
		}
	};
	function setSelected(el, value) {
		const isMultiple = el.multiple;
		const isArrayValue = isArray(value);
		if (isMultiple && !isArrayValue && !isSet(value)) return;
		for (let i = 0, l = el.options.length; i < l; i++) {
			const option = el.options[i];
			const optionValue = getValue(option);
			if (isMultiple) if (isArrayValue) {
				const optionType = typeof optionValue;
				if (optionType === "string" || optionType === "number") option.selected = value.some((v) => String(v) === String(optionValue));
				else option.selected = looseIndexOf(value, optionValue) > -1;
			} else option.selected = value.has(optionValue);
			else if (looseEqual(getValue(option), value)) {
				if (el.selectedIndex !== i) el.selectedIndex = i;
				return;
			}
		}
		if (!isMultiple && el.selectedIndex !== -1) el.selectedIndex = -1;
	}
	function getValue(el) {
		return "_value" in el ? el._value : el.value;
	}
	var systemModifiers = [
		"ctrl",
		"shift",
		"alt",
		"meta"
	];
	var modifierGuards = {
		stop: (e) => e.stopPropagation(),
		prevent: (e) => e.preventDefault(),
		self: (e) => e.target !== e.currentTarget,
		ctrl: (e) => !e.ctrlKey,
		shift: (e) => !e.shiftKey,
		alt: (e) => !e.altKey,
		meta: (e) => !e.metaKey,
		left: (e) => "button" in e && e.button !== 0,
		middle: (e) => "button" in e && e.button !== 1,
		right: (e) => "button" in e && e.button !== 2,
		exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
	};
	var withModifiers = (fn, modifiers) => {
		if (!fn) return fn;
		const cache = fn._withMods || (fn._withMods = {});
		const cacheKey = modifiers.join(".");
		return cache[cacheKey] || (cache[cacheKey] = ((event, ...args) => {
			for (let i = 0; i < modifiers.length; i++) {
				const guard = modifierGuards[modifiers[i]];
				if (guard && guard(event, modifiers)) return;
			}
			return fn(event, ...args);
		}));
	};
	var keyNames = {
		esc: "escape",
		space: " ",
		up: "arrow-up",
		left: "arrow-left",
		right: "arrow-right",
		down: "arrow-down",
		delete: "backspace"
	};
	var withKeys = (fn, modifiers) => {
		const cache = fn._withKeys || (fn._withKeys = {});
		const cacheKey = modifiers.join(".");
		return cache[cacheKey] || (cache[cacheKey] = ((event) => {
			if (!("key" in event)) return;
			const eventKey = hyphenate(event.key);
			if (modifiers.some((k) => k === eventKey || keyNames[k] === eventKey)) return fn(event);
		}));
	};
	var rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
	var renderer;
	function ensureRenderer() {
		return renderer || (renderer = createRenderer(rendererOptions));
	}
	var createApp = ((...args) => {
		const app = ensureRenderer().createApp(...args);
		const { mount } = app;
		app.mount = (containerOrSelector) => {
			const container = normalizeContainer(containerOrSelector);
			if (!container) return;
			const component = app._component;
			if (!isFunction(component) && !component.render && !component.template) component.template = container.innerHTML;
			if (container.nodeType === 1) container.textContent = "";
			const proxy = mount(container, false, resolveRootNamespace(container));
			if (container instanceof Element) {
				container.removeAttribute("v-cloak");
				container.setAttribute("data-v-app", "");
			}
			return proxy;
		};
		return app;
	});
	function resolveRootNamespace(container) {
		if (container instanceof SVGElement) return "svg";
		if (typeof MathMLElement === "function" && container instanceof MathMLElement) return "mathml";
	}
	function normalizeContainer(container) {
		if (isString(container)) return document.querySelector(container);
		return container;
	}
	//#endregion
	//#region src/vue/store.js
	var store = /* @__PURE__ */ reactive({
		projects: [],
		activePtyIds: /* @__PURE__ */ new Set(),
		activeSessionId: null,
		sessionBusyState: /* @__PURE__ */ new Map(),
		attentionSessions: /* @__PURE__ */ new Set(),
		responseReadySessions: /* @__PURE__ */ new Set(),
		lastActivityTime: /* @__PURE__ */ new Map(),
		pendingSessions: /* @__PURE__ */ new Set(),
		showStarredOnly: false,
		showRunningOnly: false,
		showTodayOnly: false,
		showArchived: false,
		searchMatchIds: null,
		searchMatchProjectPaths: null,
		visibleSessionCount: 10,
		sessionMaxAgeDays: 3,
		headerSession: null,
		headerPtyTitle: null,
		headerShellProfile: null,
		headerAccount: null,
		headerAccounts: [],
		activeTab: "sessions",
		sidebarCollapsed: false,
		loadingStatus: "",
		accountSwitching: false,
		searchQuery: "",
		searchTitlesOnly: false,
		settingsOpen: false,
		settingsScope: "global",
		settingsProjectPath: null
	});
	//#endregion
	//#region src/vue/components/SessionItem.vue
	var _hoisted_1$17 = ["id", "data-session-id"];
	var _hoisted_2$14 = { class: "session-row" };
	var _hoisted_3$14 = { class: "session-info" };
	var _hoisted_4$12 = ["value"];
	var _hoisted_5$11 = {
		key: 0,
		class: "session-subtitle"
	};
	var _hoisted_6$10 = { class: "session-meta" };
	var _hoisted_7$7 = { class: "session-actions" };
	var _hoisted_8$6 = ["data-tooltip"];
	var _hoisted_9$6 = ["innerHTML"];
	var stopSvg$1 = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\" fill=\"currentColor\"><rect x=\"2\" y=\"2\" width=\"8\" height=\"8\" rx=\"1\"/></svg>";
	var forkSvg = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 3h5v5\"/><path d=\"M8 3h-5v5\"/><path d=\"M21 3l-7.536 7.536a5 5 0 0 0-1.464 3.534v6.93\"/><path d=\"M3 3l7.536 7.536a5 5 0 0 1 1.464 3.534v.93\"/></svg>";
	var jsonlSvg = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z\"/><path d=\"M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1\"/></svg>";
	var archiveSvg$2 = "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"21 8 21 21 3 21 3 8\"/><rect x=\"1\" y=\"3\" width=\"22\" height=\"5\"/><line x1=\"10\" y1=\"12\" x2=\"14\" y2=\"12\"/></svg>";
	var launchConfigSvg = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83\"/></svg>";
	var terminalBadgeSvg = "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z\"/></svg>";
	var _sfc_main$19 = {
		__name: "SessionItem",
		props: {
			session: {
				type: Object,
				required: true
			},
			isActive: Boolean,
			isRunning: Boolean,
			isBusy: Boolean,
			isAttention: Boolean,
			isResponseReady: Boolean
		},
		emits: [
			"open",
			"stop",
			"star",
			"archive",
			"fork",
			"jsonl",
			"launch-config",
			"rename"
		],
		setup(__props, { emit: __emit }) {
			const props = __props;
			const emit = __emit;
			const renaming = /* @__PURE__ */ ref(false);
			const renameValue = /* @__PURE__ */ ref("");
			const renameInput = /* @__PURE__ */ ref(null);
			const displayName = computed(() => {
				const name = props.session.name || props.session.summary;
				return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
			});
			const cleanName = (n) => window.cleanDisplayName ? window.cleanDisplayName(n) : n;
			const timeStr = computed(() => {
				const t = window.lastActivityTime?.get(props.session.sessionId) || new Date(props.session.modified);
				return window.formatDate ? window.formatDate(t) : "";
			});
			const msgSuffix = computed(() => props.session.messageCount ? ` · ${props.session.messageCount} msgs` : "");
			const itemClasses = computed(() => ({
				active: props.isActive,
				"has-running-pty": props.isRunning,
				"cli-busy": props.isBusy,
				"needs-attention": props.isAttention,
				"response-ready": props.isResponseReady,
				"is-pinned": !!props.session.starred,
				"archived-item": !!props.session.archived,
				"is-terminal": props.session.type === "terminal"
			}));
			function startRename() {
				renameValue.value = props.session.name || props.session.summary || "";
				renaming.value = true;
				nextTick(() => renameInput.value?.focus());
			}
			async function saveRename() {
				if (!renaming.value) return;
				renaming.value = false;
				const name = renameInput.value?.value?.trim() ?? null;
				emit("rename", props.session.sessionId, name || null);
			}
			function cancelRename() {
				renaming.value = false;
			}
			const pinSvg = computed(() => props.session.starred ? "<svg width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37.722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002z\"/></svg>" : "<svg width=\"12\" height=\"12\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.2\"><path d=\"M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37.722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002z\"/></svg>");
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", {
					class: normalizeClass(["session-item", itemClasses.value]),
					id: "si-" + __props.session.sessionId,
					"data-session-id": __props.session.sessionId,
					onClick: _cache[6] || (_cache[6] = ($event) => _ctx.$emit("open", __props.session))
				}, [createBaseVNode("div", _hoisted_2$14, [
					createBaseVNode("span", { class: normalizeClass(["session-status-dot", { running: __props.isRunning }]) }, null, 2),
					createBaseVNode("div", _hoisted_3$14, [
						createBaseVNode("div", {
							class: "session-summary",
							onDblclick: withModifiers(startRename, ["stop"])
						}, [__props.session.type === "terminal" ? (openBlock(), createElementBlock("span", {
							key: 0,
							class: "terminal-badge",
							innerHTML: terminalBadgeSvg
						})) : createCommentVNode("", true), renaming.value ? (openBlock(), createElementBlock("input", {
							key: 1,
							ref_key: "renameInput",
							ref: renameInput,
							class: "session-rename-input",
							type: "text",
							value: renameValue.value,
							onBlur: saveRename,
							onKeydown: [withKeys(saveRename, ["enter"]), withKeys(cancelRename, ["esc"])]
						}, null, 40, _hoisted_4$12)) : (openBlock(), createElementBlock(Fragment, { key: 2 }, [createTextVNode(toDisplayString(displayName.value), 1)], 64))], 32),
						__props.session.aiTitle && !renaming.value ? (openBlock(), createElementBlock("div", _hoisted_5$11, toDisplayString(cleanName(__props.session.aiTitle)), 1)) : createCommentVNode("", true),
						createBaseVNode("div", _hoisted_6$10, toDisplayString(timeStr.value) + toDisplayString(msgSuffix.value), 1)
					]),
					createBaseVNode("div", _hoisted_7$7, [
						createBaseVNode("button", {
							class: "session-stop-btn",
							"data-tooltip": "Stop session",
							onClick: _cache[0] || (_cache[0] = withModifiers(($event) => _ctx.$emit("stop", __props.session.sessionId), ["stop"])),
							innerHTML: stopSvg$1
						}),
						__props.session.type !== "terminal" ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
							createBaseVNode("button", {
								class: "session-fork-btn",
								"data-tooltip": "Fork session",
								onClick: _cache[1] || (_cache[1] = withModifiers(($event) => _ctx.$emit("fork", __props.session.sessionId), ["stop"])),
								innerHTML: forkSvg
							}),
							createBaseVNode("button", {
								class: "session-jsonl-btn",
								"data-tooltip": "View messages",
								onClick: _cache[2] || (_cache[2] = withModifiers(($event) => _ctx.$emit("jsonl", __props.session.sessionId), ["stop"])),
								innerHTML: jsonlSvg
							}),
							createBaseVNode("button", {
								class: "session-archive-btn",
								"data-tooltip": __props.session.archived ? "Unarchive" : "Archive",
								onClick: _cache[3] || (_cache[3] = withModifiers(($event) => _ctx.$emit("archive", __props.session.sessionId), ["stop"])),
								innerHTML: archiveSvg$2
							}, null, 8, _hoisted_8$6),
							createBaseVNode("button", {
								class: "session-launch-config-btn",
								"data-tooltip": "Resume with config",
								onClick: _cache[4] || (_cache[4] = withModifiers(($event) => _ctx.$emit("launch-config", __props.session.sessionId), ["stop"])),
								innerHTML: launchConfigSvg
							})
						], 64)) : createCommentVNode("", true),
						createBaseVNode("span", {
							class: normalizeClass(["session-pin", { pinned: __props.session.starred }]),
							onClick: _cache[5] || (_cache[5] = withModifiers(($event) => _ctx.$emit("star", __props.session.sessionId), ["stop"])),
							innerHTML: pinSvg.value
						}, null, 10, _hoisted_9$6)
					])
				])], 10, _hoisted_1$17);
			};
		}
	};
	//#endregion
	//#region src/vue/components/SlugGroup.vue
	var _hoisted_1$16 = ["id"];
	var _hoisted_2$13 = { class: "slug-group-row" };
	var _hoisted_3$13 = { class: "slug-group-name" };
	var _hoisted_4$11 = { class: "slug-group-meta" };
	var _hoisted_5$10 = { class: "slug-group-count" };
	var _hoisted_6$9 = { class: "slug-group-sessions" };
	var archiveSvg$1 = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"21 8 21 21 3 21 3 8\"/><rect x=\"1\" y=\"3\" width=\"22\" height=\"5\"/><line x1=\"10\" y1=\"12\" x2=\"14\" y2=\"12\"/></svg>";
	var _sfc_main$18 = {
		__name: "SlugGroup",
		props: {
			slug: {
				type: String,
				required: true
			},
			sessions: {
				type: Array,
				required: true
			},
			activePtyIds: {
				type: Set,
				required: true
			},
			activeSessionId: {
				type: String,
				default: null
			},
			sessionBusyState: {
				type: Map,
				required: true
			},
			attentionSessions: {
				type: Set,
				required: true
			},
			responseReadySessions: {
				type: Set,
				required: true
			}
		},
		emits: [
			"open",
			"stop",
			"star",
			"archive",
			"fork",
			"jsonl",
			"launch-config",
			"rename",
			"archive-all"
		],
		setup(__props, { emit: __emit }) {
			const props = __props;
			const emit = __emit;
			const groupId = computed(() => "slug-" + props.slug.replace(/[^a-zA-Z0-9_-]/g, "_"));
			const storedKey = computed(() => groupId.value);
			const expanded = /* @__PURE__ */ ref((() => {
				try {
					return new Set(JSON.parse(sessionStorage.getItem("expandedSlugs") || "[]")).has(storedKey.value);
				} catch {
					return false;
				}
			})());
			const showRest = /* @__PURE__ */ ref(false);
			function toggle() {
				expanded.value = !expanded.value;
				try {
					const set = new Set(JSON.parse(sessionStorage.getItem("expandedSlugs") || "[]"));
					if (expanded.value) set.add(storedKey.value);
					else set.delete(storedKey.value);
					sessionStorage.setItem("expandedSlugs", JSON.stringify([...set]));
				} catch {}
			}
			const mostRecent = computed(() => props.sessions.reduce((a, b) => {
				const aTime = window.lastActivityTime?.get(a.sessionId) || new Date(a.modified);
				return (window.lastActivityTime?.get(b.sessionId) || new Date(b.modified)) > aTime ? b : a;
			}));
			const displayName = computed(() => {
				const s = mostRecent.value;
				const name = s.name || s.summary || props.slug;
				return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
			});
			const timeStr = computed(() => {
				const t = window.lastActivityTime?.get(mostRecent.value.sessionId) || new Date(mostRecent.value.modified);
				return window.formatDate ? window.formatDate(t) : "";
			});
			const hasRunning = computed(() => props.sessions.some((s) => props.activePtyIds.has(s.sessionId)));
			const promoted = computed(() => props.sessions.filter((s) => props.activePtyIds.has(s.sessionId)));
			const rest = computed(() => props.sessions.filter((s) => !props.activePtyIds.has(s.sessionId)));
			function sessionProps(s) {
				return {
					isActive: props.activeSessionId === s.sessionId,
					isRunning: props.activePtyIds.has(s.sessionId),
					isBusy: props.sessionBusyState.get(s.sessionId) || false,
					isAttention: props.attentionSessions.has(s.sessionId),
					isResponseReady: props.responseReadySessions.has(s.sessionId)
				};
			}
			async function archiveAll() {
				emit("archive-all", props.sessions);
			}
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", {
					class: normalizeClass(["slug-group", {
						collapsed: !expanded.value,
						"has-promoted": promoted.value.length > 0
					}]),
					id: groupId.value
				}, [createBaseVNode("div", {
					class: "slug-group-header",
					onClick: withModifiers(toggle, ["self"])
				}, [createBaseVNode("div", _hoisted_2$13, [
					createBaseVNode("span", {
						class: "slug-group-expand",
						onClick: withModifiers(toggle, ["stop"])
					}, [..._cache[4] || (_cache[4] = [createBaseVNode("span", { class: "arrow" }, "▶", -1)])]),
					createBaseVNode("div", {
						class: "slug-group-info",
						onClick: toggle
					}, [createBaseVNode("div", _hoisted_3$13, toDisplayString(displayName.value), 1), createBaseVNode("div", _hoisted_4$11, [
						createBaseVNode("span", { class: normalizeClass(["slug-group-dot", { running: hasRunning.value }]) }, null, 2),
						createBaseVNode("span", _hoisted_5$10, toDisplayString(__props.sessions.length) + " sessions", 1),
						createTextVNode(" " + toDisplayString(" " + timeStr.value), 1)
					])]),
					createBaseVNode("button", {
						class: "slug-group-archive-btn",
						"data-tooltip": "Archive all sessions in group",
						onClick: withModifiers(archiveAll, ["stop"]),
						innerHTML: archiveSvg$1
					})
				])]), createBaseVNode("div", _hoisted_6$9, [(openBlock(true), createElementBlock(Fragment, null, renderList(promoted.value, (s) => {
					return openBlock(), createBlock(_sfc_main$19, mergeProps({
						key: s.sessionId,
						session: s
					}, { ref_for: true }, sessionProps(s), {
						onOpen: ($event) => _ctx.$emit("open", s),
						onStop: ($event) => _ctx.$emit("stop", s.sessionId),
						onStar: ($event) => _ctx.$emit("star", s.sessionId),
						onArchive: ($event) => _ctx.$emit("archive", s.sessionId),
						onFork: ($event) => _ctx.$emit("fork", s.sessionId),
						onJsonl: ($event) => _ctx.$emit("jsonl", s.sessionId),
						onLaunchConfig: ($event) => _ctx.$emit("launch-config", s.sessionId),
						onRename: _cache[0] || (_cache[0] = (id, name) => _ctx.$emit("rename", id, name))
					}), null, 16, [
						"session",
						"onOpen",
						"onStop",
						"onStar",
						"onArchive",
						"onFork",
						"onJsonl",
						"onLaunchConfig"
					]);
				}), 128)), promoted.value.length > 0 && rest.value.length > 0 ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createBaseVNode("div", {
					class: normalizeClass(["slug-group-more", { expanded: showRest.value }]),
					onClick: _cache[1] || (_cache[1] = ($event) => showRest.value = !showRest.value)
				}, [!showRest.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode("+ " + toDisplayString(rest.value.length) + " more", 1)], 64)) : createCommentVNode("", true)], 2), showRest.value ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(rest.value, (s) => {
					return openBlock(), createBlock(_sfc_main$19, mergeProps({
						key: s.sessionId,
						session: s
					}, { ref_for: true }, sessionProps(s), {
						onOpen: ($event) => _ctx.$emit("open", s),
						onStop: ($event) => _ctx.$emit("stop", s.sessionId),
						onStar: ($event) => _ctx.$emit("star", s.sessionId),
						onArchive: ($event) => _ctx.$emit("archive", s.sessionId),
						onFork: ($event) => _ctx.$emit("fork", s.sessionId),
						onJsonl: ($event) => _ctx.$emit("jsonl", s.sessionId),
						onLaunchConfig: ($event) => _ctx.$emit("launch-config", s.sessionId),
						onRename: _cache[2] || (_cache[2] = (id, name) => _ctx.$emit("rename", id, name))
					}), null, 16, [
						"session",
						"onOpen",
						"onStop",
						"onStar",
						"onArchive",
						"onFork",
						"onJsonl",
						"onLaunchConfig"
					]);
				}), 128)) : createCommentVNode("", true)], 64)) : (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(rest.value, (s) => {
					return openBlock(), createBlock(_sfc_main$19, mergeProps({
						key: s.sessionId,
						session: s
					}, { ref_for: true }, sessionProps(s), {
						onOpen: ($event) => _ctx.$emit("open", s),
						onStop: ($event) => _ctx.$emit("stop", s.sessionId),
						onStar: ($event) => _ctx.$emit("star", s.sessionId),
						onArchive: ($event) => _ctx.$emit("archive", s.sessionId),
						onFork: ($event) => _ctx.$emit("fork", s.sessionId),
						onJsonl: ($event) => _ctx.$emit("jsonl", s.sessionId),
						onLaunchConfig: ($event) => _ctx.$emit("launch-config", s.sessionId),
						onRename: _cache[3] || (_cache[3] = (id, name) => _ctx.$emit("rename", id, name))
					}), null, 16, [
						"session",
						"onOpen",
						"onStop",
						"onStar",
						"onArchive",
						"onFork",
						"onJsonl",
						"onLaunchConfig"
					]);
				}), 128))])], 10, _hoisted_1$16);
			};
		}
	};
	//#endregion
	//#region src/vue/components/ProjectGroup.vue
	var _hoisted_1$15 = ["id"];
	var _hoisted_2$12 = ["id"];
	var _hoisted_3$12 = ["id"];
	var _hoisted_4$10 = ["id"];
	var gearSvg = "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z\"/></svg>";
	var archiveSvg = "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"21 8 21 21 3 21 3 8\"/><rect x=\"1\" y=\"3\" width=\"22\" height=\"5\"/><line x1=\"10\" y1=\"12\" x2=\"14\" y2=\"12\"/></svg>";
	var plusSvg = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><line x1=\"6\" y1=\"2\" x2=\"6\" y2=\"10\"/><line x1=\"2\" y1=\"6\" x2=\"10\" y2=\"6\"/></svg>";
	var plusSmSvg = "<svg width=\"10\" height=\"10\" viewBox=\"0 0 12 12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><line x1=\"6\" y1=\"2\" x2=\"6\" y2=\"10\"/><line x1=\"2\" y1=\"6\" x2=\"10\" y2=\"6\"/></svg>";
	var closeSvg = "<svg width=\"10\" height=\"10\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>";
	var branchSvg = "<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4\"/><path d=\"M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3\"/><path d=\"M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35\"/><path d=\"M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14\"/></svg>";
	var _sfc_main$17 = {
		__name: "ProjectGroup",
		props: {
			project: {
				type: Object,
				required: true
			},
			isWorktree: {
				type: Boolean,
				default: false
			},
			activePtyIds: {
				type: Set,
				required: true
			},
			activeSessionId: {
				type: String,
				default: null
			},
			sessionBusyState: {
				type: Map,
				required: true
			},
			attentionSessions: {
				type: Set,
				required: true
			},
			responseReadySessions: {
				type: Set,
				required: true
			},
			searchMatchIds: {
				type: Set,
				default: null
			},
			showArchived: Boolean,
			showStarredOnly: Boolean,
			showRunningOnly: Boolean,
			showTodayOnly: Boolean,
			visibleSessionCount: {
				type: Number,
				default: 10
			},
			sessionMaxAgeDays: {
				type: Number,
				default: 3
			},
			worktrees: {
				type: Array,
				default: () => []
			}
		},
		emits: [
			"open",
			"stop",
			"star",
			"archive",
			"fork",
			"jsonl",
			"launch-config",
			"rename",
			"new-session",
			"settings",
			"archive-sessions",
			"remove-project"
		],
		setup(__props, { emit: __emit }) {
			const props = __props;
			const emit = __emit;
			const folderId = computed(() => "project-" + props.project.projectPath.replace(/[^a-zA-Z0-9_-]/g, "_"));
			const avatar = computed(() => window.getProjectAvatar ? window.getProjectAvatar(props.project.projectPath) : {
				initials: "?",
				color: "#666"
			});
			const shortName = computed(() => props.project.projectPath.split("/").filter(Boolean).slice(-2).join("/"));
			const worktreeName = computed(() => {
				return props.project.projectPath.match(/\/\.claude\/worktrees\/([^/]+)\/?$/)?.[1] || props.project.projectPath.split("/").pop();
			});
			const collapsed = /* @__PURE__ */ ref(() => {
				if (props.project._projectMatchedOnly) return true;
				if (props.searchMatchIds || props.showStarredOnly || props.showRunningOnly) return false;
				const sessions = props.project.sessions || [];
				if (sessions.length === 0) return false;
				const mostRecent = sessions.reduce((a, b) => new Date(b.modified) > new Date(a.modified) ? b : a);
				return Date.now() - new Date(mostRecent.modified) > props.sessionMaxAgeDays * 864e5;
			});
			function toggle() {
				collapsed.value = !collapsed.value;
			}
			const showOlder = /* @__PURE__ */ ref(false);
			const allItems = computed(() => {
				let sessions = props.project.sessions || [];
				if (!props.showArchived && !props.searchMatchIds) sessions = sessions.filter((s) => !s.archived);
				if (props.showStarredOnly) sessions = sessions.filter((s) => s.starred);
				if (props.showRunningOnly) sessions = sessions.filter((s) => props.activePtyIds.has(s.sessionId));
				if (props.showTodayOnly) {
					const now = /* @__PURE__ */ new Date();
					const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
					sessions = sessions.filter((s) => {
						if (!s.modified) return false;
						const d = new Date(s.modified);
						return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === todayStr;
					});
				}
				if (props.searchMatchIds) sessions = sessions.filter((s) => props.searchMatchIds.has(s.sessionId));
				const slugMap = /* @__PURE__ */ new Map();
				const ungrouped = [];
				for (const s of sessions) if (s.slug) {
					if (!slugMap.has(s.slug)) slugMap.set(s.slug, []);
					slugMap.get(s.slug).push(s);
				} else ungrouped.push(s);
				const items = [];
				for (const s of ungrouped) {
					const running = props.activePtyIds.has(s.sessionId);
					items.push({
						type: "session",
						session: s,
						sortTime: new Date(s.modified).getTime(),
						pinned: !!s.starred,
						running
					});
				}
				for (const [slug, slugSessions] of slugMap) if (slugSessions.length === 1) {
					const s = slugSessions[0];
					items.push({
						type: "session",
						session: s,
						sortTime: new Date(s.modified).getTime(),
						pinned: !!s.starred,
						running: props.activePtyIds.has(s.sessionId)
					});
				} else {
					const mostRecentTime = Math.max(...slugSessions.map((s) => new Date(s.modified).getTime()));
					const hasRunning = slugSessions.some((s) => props.activePtyIds.has(s.sessionId));
					const hasPinned = slugSessions.some((s) => s.starred);
					items.push({
						type: "slug",
						slug,
						sessions: slugSessions,
						sortTime: mostRecentTime,
						pinned: hasPinned,
						running: hasRunning
					});
				}
				items.sort((a, b) => {
					const aPri = a.pinned && a.running ? 3 : a.running ? 2 : a.pinned ? 1 : 0;
					const bPri = b.pinned && b.running ? 3 : b.running ? 2 : b.pinned ? 1 : 0;
					if (aPri !== bPri) return bPri - aPri;
					return b.sortTime - a.sortTime;
				});
				return items;
			});
			const visibleItems = computed(() => {
				if (props.showStarredOnly || props.showRunningOnly || props.showTodayOnly || props.searchMatchIds) return allItems.value;
				const ageCutoff = Date.now() - props.sessionMaxAgeDays * 864e5;
				let count = 0;
				return allItems.value.filter((item) => {
					if (item.running || item.pinned || count < props.visibleSessionCount && item.sortTime >= ageCutoff) {
						count++;
						return true;
					}
					return false;
				});
			});
			const olderItems = computed(() => {
				const visIds = new Set(visibleItems.value.map((i) => i.type === "slug" ? "slug-" + i.slug : i.session.sessionId));
				return allItems.value.filter((i) => !visIds.has(i.type === "slug" ? "slug-" + i.slug : i.session.sessionId));
			});
			async function archiveAll() {
				emit("archive-sessions", props.project.sessions.filter((s) => !s.archived));
			}
			return (_ctx, _cache) => {
				const _component_ProjectGroup = resolveComponent("ProjectGroup", true);
				return openBlock(), createElementBlock("div", {
					class: normalizeClass(__props.isWorktree ? "worktree-group" : "project-group"),
					id: folderId.value
				}, [__props.isWorktree ? (openBlock(), createElementBlock("div", {
					key: 0,
					class: normalizeClass(["worktree-header", { collapsed: collapsed.value }]),
					id: "ph-" + folderId.value,
					onClick: withModifiers(toggle, ["self"])
				}, [
					createBaseVNode("span", {
						class: "worktree-branch-icon",
						innerHTML: branchSvg,
						onClick: withModifiers(toggle, ["stop"])
					}),
					createBaseVNode("span", {
						class: "worktree-name",
						onClick: withModifiers(toggle, ["stop"])
					}, toDisplayString(worktreeName.value), 1),
					createBaseVNode("button", {
						class: "worktree-hide-btn",
						"data-tooltip": "Hide worktree",
						onClick: _cache[0] || (_cache[0] = withModifiers(($event) => _ctx.$emit("remove-project", __props.project.projectPath), ["stop"])),
						innerHTML: closeSvg
					}),
					createBaseVNode("button", {
						class: "project-new-btn worktree-new-btn",
						"data-tooltip": "New session in worktree",
						onClick: _cache[1] || (_cache[1] = withModifiers(($event) => _ctx.$emit("new-session", __props.project), ["stop"])),
						innerHTML: plusSmSvg
					})
				], 10, _hoisted_2$12)) : (openBlock(), createElementBlock("div", {
					key: 1,
					class: normalizeClass(["project-header", { collapsed: collapsed.value }]),
					id: "ph-" + folderId.value,
					onClick: withModifiers(toggle, ["self"])
				}, [
					createBaseVNode("span", {
						class: "arrow",
						onClick: withModifiers(toggle, ["stop"])
					}, "▼"),
					createBaseVNode("span", {
						class: "project-header-avatar",
						style: normalizeStyle({ background: avatar.value.color }),
						onClick: withModifiers(toggle, ["stop"])
					}, toDisplayString(avatar.value.initials), 5),
					createBaseVNode("span", {
						class: "project-name",
						onClick: withModifiers(toggle, ["stop"])
					}, toDisplayString(shortName.value), 1),
					createBaseVNode("button", {
						class: "project-settings-btn",
						"data-tooltip": "Project settings",
						onClick: _cache[2] || (_cache[2] = withModifiers(($event) => _ctx.$emit("settings", __props.project.projectPath), ["stop"])),
						innerHTML: gearSvg
					}),
					createBaseVNode("button", {
						class: "project-archive-btn",
						"data-tooltip": "Archive all sessions",
						onClick: withModifiers(archiveAll, ["stop"]),
						innerHTML: archiveSvg
					}),
					createBaseVNode("button", {
						class: "project-new-btn",
						"data-tooltip": "New session",
						onClick: _cache[3] || (_cache[3] = withModifiers(($event) => _ctx.$emit("new-session", __props.project), ["stop"])),
						innerHTML: plusSvg
					})
				], 10, _hoisted_3$12)), createBaseVNode("div", {
					class: normalizeClass(__props.isWorktree ? "worktree-sessions" : "project-sessions"),
					id: "sessions-" + folderId.value
				}, [
					(openBlock(true), createElementBlock(Fragment, null, renderList(visibleItems.value, (item) => {
						return openBlock(), createElementBlock(Fragment, { key: item.type === "slug" ? "slug-" + item.slug : item.session.sessionId }, [item.type === "slug" ? (openBlock(), createBlock(_sfc_main$18, {
							key: 0,
							slug: item.slug,
							sessions: item.sessions,
							"active-pty-ids": __props.activePtyIds,
							"active-session-id": __props.activeSessionId,
							"session-busy-state": __props.sessionBusyState,
							"attention-sessions": __props.attentionSessions,
							"response-ready-sessions": __props.responseReadySessions,
							onOpen: _cache[4] || (_cache[4] = (s) => _ctx.$emit("open", s)),
							onStop: _cache[5] || (_cache[5] = (id) => _ctx.$emit("stop", id)),
							onStar: _cache[6] || (_cache[6] = (id) => _ctx.$emit("star", id)),
							onArchive: _cache[7] || (_cache[7] = (id) => _ctx.$emit("archive", id)),
							onFork: _cache[8] || (_cache[8] = (id) => _ctx.$emit("fork", id)),
							onJsonl: _cache[9] || (_cache[9] = (id) => _ctx.$emit("jsonl", id)),
							onLaunchConfig: _cache[10] || (_cache[10] = (id) => _ctx.$emit("launch-config", id)),
							onRename: _cache[11] || (_cache[11] = (id, name) => _ctx.$emit("rename", id, name)),
							onArchiveAll: _cache[12] || (_cache[12] = (sessions) => _ctx.$emit("archive-sessions", sessions))
						}, null, 8, [
							"slug",
							"sessions",
							"active-pty-ids",
							"active-session-id",
							"session-busy-state",
							"attention-sessions",
							"response-ready-sessions"
						])) : (openBlock(), createBlock(_sfc_main$19, {
							key: 1,
							session: item.session,
							"is-active": __props.activeSessionId === item.session.sessionId,
							"is-running": __props.activePtyIds.has(item.session.sessionId),
							"is-busy": __props.sessionBusyState.get(item.session.sessionId) || false,
							"is-attention": __props.attentionSessions.has(item.session.sessionId),
							"is-response-ready": __props.responseReadySessions.has(item.session.sessionId),
							onOpen: ($event) => _ctx.$emit("open", item.session),
							onStop: ($event) => _ctx.$emit("stop", item.session.sessionId),
							onStar: ($event) => _ctx.$emit("star", item.session.sessionId),
							onArchive: ($event) => _ctx.$emit("archive", item.session.sessionId),
							onFork: ($event) => _ctx.$emit("fork", item.session.sessionId),
							onJsonl: ($event) => _ctx.$emit("jsonl", item.session.sessionId),
							onLaunchConfig: ($event) => _ctx.$emit("launch-config", item.session.sessionId),
							onRename: _cache[13] || (_cache[13] = (id, name) => _ctx.$emit("rename", id, name))
						}, null, 8, [
							"session",
							"is-active",
							"is-running",
							"is-busy",
							"is-attention",
							"is-response-ready",
							"onOpen",
							"onStop",
							"onStar",
							"onArchive",
							"onFork",
							"onJsonl",
							"onLaunchConfig"
						]))], 64);
					}), 128)),
					olderItems.value.length > 0 ? (openBlock(), createElementBlock("div", {
						key: 0,
						class: normalizeClass(["sessions-more-toggle", { expanded: showOlder.value }]),
						onClick: _cache[14] || (_cache[14] = ($event) => showOlder.value = !showOlder.value)
					}, toDisplayString(showOlder.value ? "- hide older" : `+ ${olderItems.value.length} older`), 3)) : createCommentVNode("", true),
					showOlder.value ? (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(olderItems.value, (item) => {
						return openBlock(), createElementBlock(Fragment, { key: item.type === "slug" ? "slug-" + item.slug : item.session.sessionId }, [item.type === "slug" ? (openBlock(), createBlock(_sfc_main$18, {
							key: 0,
							slug: item.slug,
							sessions: item.sessions,
							"active-pty-ids": __props.activePtyIds,
							"active-session-id": __props.activeSessionId,
							"session-busy-state": __props.sessionBusyState,
							"attention-sessions": __props.attentionSessions,
							"response-ready-sessions": __props.responseReadySessions,
							onOpen: _cache[15] || (_cache[15] = (s) => _ctx.$emit("open", s)),
							onStop: _cache[16] || (_cache[16] = (id) => _ctx.$emit("stop", id)),
							onStar: _cache[17] || (_cache[17] = (id) => _ctx.$emit("star", id)),
							onArchive: _cache[18] || (_cache[18] = (id) => _ctx.$emit("archive", id)),
							onFork: _cache[19] || (_cache[19] = (id) => _ctx.$emit("fork", id)),
							onJsonl: _cache[20] || (_cache[20] = (id) => _ctx.$emit("jsonl", id)),
							onLaunchConfig: _cache[21] || (_cache[21] = (id) => _ctx.$emit("launch-config", id)),
							onRename: _cache[22] || (_cache[22] = (id, name) => _ctx.$emit("rename", id, name)),
							onArchiveAll: _cache[23] || (_cache[23] = (sessions) => _ctx.$emit("archive-sessions", sessions))
						}, null, 8, [
							"slug",
							"sessions",
							"active-pty-ids",
							"active-session-id",
							"session-busy-state",
							"attention-sessions",
							"response-ready-sessions"
						])) : (openBlock(), createBlock(_sfc_main$19, {
							key: 1,
							session: item.session,
							"is-active": __props.activeSessionId === item.session.sessionId,
							"is-running": __props.activePtyIds.has(item.session.sessionId),
							"is-busy": __props.sessionBusyState.get(item.session.sessionId) || false,
							"is-attention": __props.attentionSessions.has(item.session.sessionId),
							"is-response-ready": __props.responseReadySessions.has(item.session.sessionId),
							onOpen: ($event) => _ctx.$emit("open", item.session),
							onStop: ($event) => _ctx.$emit("stop", item.session.sessionId),
							onStar: ($event) => _ctx.$emit("star", item.session.sessionId),
							onArchive: ($event) => _ctx.$emit("archive", item.session.sessionId),
							onFork: ($event) => _ctx.$emit("fork", item.session.sessionId),
							onJsonl: ($event) => _ctx.$emit("jsonl", item.session.sessionId),
							onLaunchConfig: ($event) => _ctx.$emit("launch-config", item.session.sessionId),
							onRename: _cache[24] || (_cache[24] = (id, name) => _ctx.$emit("rename", id, name))
						}, null, 8, [
							"session",
							"is-active",
							"is-running",
							"is-busy",
							"is-attention",
							"is-response-ready",
							"onOpen",
							"onStop",
							"onStar",
							"onArchive",
							"onFork",
							"onJsonl",
							"onLaunchConfig"
						]))], 64);
					}), 128)) : createCommentVNode("", true),
					(openBlock(true), createElementBlock(Fragment, null, renderList(__props.worktrees, (wt) => {
						return openBlock(), createBlock(_component_ProjectGroup, {
							key: wt.projectPath,
							project: wt,
							"is-worktree": true,
							"active-pty-ids": __props.activePtyIds,
							"active-session-id": __props.activeSessionId,
							"session-busy-state": __props.sessionBusyState,
							"attention-sessions": __props.attentionSessions,
							"response-ready-sessions": __props.responseReadySessions,
							"search-match-ids": __props.searchMatchIds,
							"show-archived": __props.showArchived,
							"show-starred-only": __props.showStarredOnly,
							"show-running-only": __props.showRunningOnly,
							"show-today-only": __props.showTodayOnly,
							"visible-session-count": __props.visibleSessionCount,
							"session-max-age-days": __props.sessionMaxAgeDays,
							onOpen: _cache[25] || (_cache[25] = (s) => _ctx.$emit("open", s)),
							onStop: _cache[26] || (_cache[26] = (id) => _ctx.$emit("stop", id)),
							onStar: _cache[27] || (_cache[27] = (id) => _ctx.$emit("star", id)),
							onArchive: _cache[28] || (_cache[28] = (id) => _ctx.$emit("archive", id)),
							onFork: _cache[29] || (_cache[29] = (id) => _ctx.$emit("fork", id)),
							onJsonl: _cache[30] || (_cache[30] = (id) => _ctx.$emit("jsonl", id)),
							onLaunchConfig: _cache[31] || (_cache[31] = (id) => _ctx.$emit("launch-config", id)),
							onRename: _cache[32] || (_cache[32] = (id, name) => _ctx.$emit("rename", id, name)),
							onNewSession: _cache[33] || (_cache[33] = (p) => _ctx.$emit("new-session", p)),
							onSettings: _cache[34] || (_cache[34] = (path) => _ctx.$emit("settings", path)),
							onArchiveSessions: _cache[35] || (_cache[35] = (sessions) => _ctx.$emit("archive-sessions", sessions)),
							onRemoveProject: _cache[36] || (_cache[36] = (path) => _ctx.$emit("remove-project", path))
						}, null, 8, [
							"project",
							"active-pty-ids",
							"active-session-id",
							"session-busy-state",
							"attention-sessions",
							"response-ready-sessions",
							"search-match-ids",
							"show-archived",
							"show-starred-only",
							"show-running-only",
							"show-today-only",
							"visible-session-count",
							"session-max-age-days"
						]);
					}), 128))
				], 10, _hoisted_4$10)], 10, _hoisted_1$15);
			};
		}
	};
	//#endregion
	//#region src/vue/components/SidebarApp.vue
	var _sfc_main$16 = {
		__name: "SidebarApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props) {
			const props = __props;
			const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;
			const worktreeMap = computed(() => {
				const map = /* @__PURE__ */ new Map();
				for (const p of store.projects) {
					const match = p.projectPath.match(worktreePattern);
					if (match) {
						const parent = match[1];
						if (!map.has(parent)) map.set(parent, []);
						map.get(parent).push(p);
					}
				}
				return map;
			});
			const worktreeSet = computed(() => {
				const s = /* @__PURE__ */ new Set();
				for (const p of store.projects) if (worktreePattern.test(p.projectPath)) s.add(p.projectPath);
				return s;
			});
			const visibleProjects = computed(() => {
				let projects = store.projects;
				if (store.searchMatchIds !== null) projects = projects.map((p) => {
					const hasMatchingSessions = p.sessions.some((s) => store.searchMatchIds.has(s.sessionId));
					const projectMatched = store.searchMatchProjectPaths?.has(p.projectPath);
					if (!hasMatchingSessions && !projectMatched) return null;
					return {
						...p,
						sessions: hasMatchingSessions ? p.sessions.filter((s) => store.searchMatchIds.has(s.sessionId)) : [],
						_projectMatchedOnly: projectMatched && !hasMatchingSessions
					};
				}).filter(Boolean);
				else projects = projects.filter((p) => {
					return (store.showArchived ? p.sessions : p.sessions.filter((s) => !s.archived)).length > 0;
				});
				return projects.filter((p) => !worktreeSet.value.has(p.projectPath));
			});
			function onOpen(session) {
				props.callbacks.openSession?.(session);
			}
			function onStop(id) {
				props.callbacks.stopSession?.(id);
			}
			function onStar(id) {
				props.callbacks.toggleStar?.(id);
			}
			function onArchive(id) {
				props.callbacks.archiveSession?.(id);
			}
			function onFork(id) {
				props.callbacks.forkSession?.(id);
			}
			function onJsonl(id) {
				props.callbacks.showJsonl?.(id);
			}
			function onLaunchConfig(id) {
				props.callbacks.launchConfig?.(id);
			}
			function onRename(id, name) {
				props.callbacks.renameSession?.(id, name);
			}
			function onNewSession(project) {
				props.callbacks.newSession?.(project);
			}
			function onSettings(path) {
				props.callbacks.openSettings?.(path);
			}
			function onArchiveSessions(sessions) {
				props.callbacks.archiveSessions?.(sessions);
			}
			function onRemoveProject(path) {
				props.callbacks.removeProject?.(path);
			}
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", null, [(openBlock(true), createElementBlock(Fragment, null, renderList(visibleProjects.value, (project) => {
					return openBlock(), createBlock(_sfc_main$17, {
						key: project.projectPath,
						project,
						worktrees: worktreeMap.value.get(project.projectPath) || [],
						"active-pty-ids": unref(store).activePtyIds,
						"active-session-id": unref(store).activeSessionId,
						"session-busy-state": unref(store).sessionBusyState,
						"attention-sessions": unref(store).attentionSessions,
						"response-ready-sessions": unref(store).responseReadySessions,
						"search-match-ids": unref(store).searchMatchIds,
						"show-archived": unref(store).showArchived,
						"show-starred-only": unref(store).showStarredOnly,
						"show-running-only": unref(store).showRunningOnly,
						"show-today-only": unref(store).showTodayOnly,
						"visible-session-count": unref(store).visibleSessionCount,
						"session-max-age-days": unref(store).sessionMaxAgeDays,
						onOpen,
						onStop,
						onStar,
						onArchive,
						onFork,
						onJsonl,
						onLaunchConfig,
						onRename,
						onNewSession,
						onSettings,
						onArchiveSessions,
						onRemoveProject
					}, null, 8, [
						"project",
						"worktrees",
						"active-pty-ids",
						"active-session-id",
						"session-busy-state",
						"attention-sessions",
						"response-ready-sessions",
						"search-match-ids",
						"show-archived",
						"show-starred-only",
						"show-running-only",
						"show-today-only",
						"visible-session-count",
						"session-max-age-days"
					]);
				}), 128))]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/SessionHeaderApp.vue
	var _hoisted_1$14 = {
		key: 0,
		class: "vue-session-header"
	};
	var _hoisted_2$11 = { class: "vsh-top" };
	var _hoisted_3$11 = { class: "vsh-identity" };
	var _hoisted_4$9 = { class: "vsh-breadcrumb" };
	var _hoisted_5$9 = { class: "vsh-project-path" };
	var _hoisted_6$8 = ["title"];
	var _hoisted_7$6 = { class: "vsh-controls" };
	var _hoisted_8$5 = {
		key: 0,
		class: "terminal-account-badge"
	};
	var _hoisted_9$5 = {
		key: 1,
		class: "vsh-shell-badge"
	};
	var _hoisted_10$5 = {
		key: 0,
		class: "vsh-ai-title"
	};
	var _hoisted_11$5 = {
		key: 1,
		class: "vsh-pty-title"
	};
	var _hoisted_12$5 = { class: "vsh-status" };
	var _hoisted_13$5 = { class: "vsh-status-label" };
	var _hoisted_14$5 = { class: "vsh-msg-count" };
	var _hoisted_15$5 = { class: "vsh-time" };
	var _hoisted_16$5 = { class: "vsh-session-id" };
	var stopSvg = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\" fill=\"currentColor\"><rect x=\"2\" y=\"2\" width=\"8\" height=\"8\" rx=\"1\"/></svg>";
	var _sfc_main$15 = {
		__name: "SessionHeaderApp",
		setup(__props) {
			const session = computed(() => store.headerSession);
			const sessionId = computed(() => session.value?.sessionId);
			const avatar = computed(() => {
				const path = session.value?.projectPath || "";
				return window.getProjectAvatar ? window.getProjectAvatar(path) : {
					initials: "?",
					color: "#888"
				};
			});
			const projectShortPath = computed(() => {
				return (session.value?.projectPath || "").split("/").filter(Boolean).slice(-2).join("/");
			});
			const sessionName = computed(() => {
				const s = session.value;
				if (!s) return "";
				const name = s.name || s.summary || "Session";
				return window.cleanDisplayName ? window.cleanDisplayName(name) : name;
			});
			const aiTitle = computed(() => {
				const s = session.value;
				if (!s?.aiTitle) return null;
				const cleaned = window.cleanDisplayName ? window.cleanDisplayName(s.aiTitle) : s.aiTitle;
				return cleaned !== sessionName.value ? cleaned : null;
			});
			const isRunning = computed(() => store.activePtyIds?.has(sessionId.value));
			const isBusy = computed(() => store.sessionBusyState?.get(sessionId.value) || false);
			const isAttention = computed(() => store.attentionSessions?.has(sessionId.value));
			const statusClass = computed(() => ({
				running: isRunning.value,
				busy: isBusy.value,
				attention: isAttention.value
			}));
			const statusLabel = computed(() => {
				if (isAttention.value) return "Needs attention";
				if (isBusy.value) return "Working…";
				if (isRunning.value) return "Running";
				return "Stopped";
			});
			const messageCount = computed(() => session.value?.messageCount || null);
			const timeStr = computed(() => {
				const s = session.value;
				if (!s) return "";
				const t = window.lastActivityTime?.get(s.sessionId) || new Date(s.modified);
				return window.formatDate ? window.formatDate(t) : "";
			});
			const shortId = computed(() => {
				return (sessionId.value || "").slice(0, 8);
			});
			function stop() {
				if (sessionId.value && window.confirmAndStopSession) window.confirmAndStopSession(sessionId.value);
			}
			return (_ctx, _cache) => {
				return unref(store).headerSession ? (openBlock(), createElementBlock("div", _hoisted_1$14, [
					createBaseVNode("div", _hoisted_2$11, [createBaseVNode("div", _hoisted_3$11, [createBaseVNode("span", {
						class: "vsh-avatar",
						style: normalizeStyle({ background: avatar.value.color })
					}, toDisplayString(avatar.value.initials), 5), createBaseVNode("div", _hoisted_4$9, [
						createBaseVNode("span", _hoisted_5$9, toDisplayString(projectShortPath.value), 1),
						_cache[0] || (_cache[0] = createBaseVNode("span", { class: "vsh-sep" }, "›", -1)),
						createBaseVNode("span", {
							class: "vsh-session-name",
							title: sessionName.value
						}, toDisplayString(sessionName.value), 9, _hoisted_6$8)
					])]), createBaseVNode("div", _hoisted_7$6, [
						unref(store).headerAccount ? (openBlock(), createElementBlock("span", _hoisted_8$5, toDisplayString(unref(store).headerAccount), 1)) : createCommentVNode("", true),
						unref(store).headerShellProfile ? (openBlock(), createElementBlock("span", _hoisted_9$5, toDisplayString(unref(store).headerShellProfile), 1)) : createCommentVNode("", true),
						createBaseVNode("button", {
							class: "session-stop-btn vsh-stop",
							"data-tooltip": "Stop session",
							onClick: stop,
							innerHTML: stopSvg
						})
					])]),
					aiTitle.value ? (openBlock(), createElementBlock("div", _hoisted_10$5, toDisplayString(aiTitle.value), 1)) : createCommentVNode("", true),
					unref(store).headerPtyTitle ? (openBlock(), createElementBlock("div", _hoisted_11$5, toDisplayString(unref(store).headerPtyTitle), 1)) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_12$5, [
						createBaseVNode("span", { class: normalizeClass(["vsh-status-dot", statusClass.value]) }, null, 2),
						createBaseVNode("span", _hoisted_13$5, toDisplayString(statusLabel.value), 1),
						messageCount.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [_cache[1] || (_cache[1] = createBaseVNode("span", { class: "vsh-dot-sep" }, "·", -1)), createBaseVNode("span", _hoisted_14$5, toDisplayString(messageCount.value) + " msgs", 1)], 64)) : createCommentVNode("", true),
						timeStr.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [_cache[2] || (_cache[2] = createBaseVNode("span", { class: "vsh-dot-sep" }, "·", -1)), createBaseVNode("span", _hoisted_15$5, toDisplayString(timeStr.value), 1)], 64)) : createCommentVNode("", true),
						sessionId.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [_cache[3] || (_cache[3] = createBaseVNode("span", { class: "vsh-dot-sep" }, "·", -1)), createBaseVNode("span", _hoisted_16$5, toDisplayString(shortId.value), 1)], 64)) : createCommentVNode("", true)
					])
				])) : createCommentVNode("", true);
			};
		}
	};
	//#endregion
	//#region src/vue/components/ListItem.vue
	var _hoisted_1$13 = ["id"];
	var _hoisted_2$10 = { class: "session-row" };
	var _hoisted_3$10 = { class: "session-info" };
	var _hoisted_4$8 = { class: "session-summary" };
	var _hoisted_5$8 = {
		key: 0,
		class: "session-subtitle"
	};
	var _hoisted_6$7 = {
		key: 1,
		class: "session-meta"
	};
	var _sfc_main$14 = {
		__name: "ListItem",
		props: {
			title: {
				type: String,
				default: ""
			},
			subtitle: {
				type: String,
				default: null
			},
			meta: {
				type: String,
				default: null
			},
			active: {
				type: Boolean,
				default: false
			},
			classes: {
				type: Array,
				default: () => []
			},
			itemId: {
				type: String,
				default: void 0
			}
		},
		emits: ["click"],
		setup(__props) {
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", {
					class: normalizeClass(["session-item", [...__props.classes, { active: __props.active }]]),
					id: __props.itemId,
					onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("click"))
				}, [createBaseVNode("div", _hoisted_2$10, [
					renderSlot(_ctx.$slots, "leading"),
					createBaseVNode("div", _hoisted_3$10, [
						createBaseVNode("div", _hoisted_4$8, toDisplayString(__props.title), 1),
						__props.subtitle ? (openBlock(), createElementBlock("div", _hoisted_5$8, toDisplayString(__props.subtitle), 1)) : createCommentVNode("", true),
						__props.meta ? (openBlock(), createElementBlock("div", _hoisted_6$7, toDisplayString(__props.meta), 1)) : createCommentVNode("", true)
					]),
					renderSlot(_ctx.$slots, "trailing")
				])], 10, _hoisted_1$13);
			};
		}
	};
	//#endregion
	//#region src/vue/components/PlansApp.vue
	var _hoisted_1$12 = {
		key: 0,
		class: "plans-empty"
	};
	var _hoisted_2$9 = {
		key: 1,
		class: "project-group"
	};
	var _hoisted_3$9 = { class: "project-sessions" };
	var planSvg = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 17 17\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0\"><path d=\"M14 2v-2h-13v17h13v-2h2v-13h-2zM2 16v-15h2v15h-2zM13 16h-8v-15h8v15zM15 14h-1v-3h1v3zM15 10h-1v-3h1v3zM14 6v-3h1v3h-1zM6 4h5v1h-5v-1zM6 6h4v1h-4v-1z\"/></svg>";
	var _sfc_main$13 = {
		__name: "PlansApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props, { expose: __expose }) {
			const props = __props;
			const plans = /* @__PURE__ */ ref([]);
			const activePlan = /* @__PURE__ */ ref(null);
			function fmtDate(d) {
				return window.formatDate ? window.formatDate(new Date(d)) : d;
			}
			function openPlan(plan) {
				activePlan.value = plan.filename;
				props.callbacks.openPlan?.(plan);
			}
			__expose({
				setPlans(list) {
					plans.value = list;
				},
				setActive(filename) {
					activePlan.value = filename;
				},
				clearActive() {
					activePlan.value = null;
				}
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", null, [plans.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_1$12, " No plans found in ~/.claude/plans/ ")) : (openBlock(), createElementBlock("div", _hoisted_2$9, [_cache[0] || (_cache[0] = createBaseVNode("div", { class: "project-header" }, [createBaseVNode("span", { class: "project-name" }, "Plans")], -1)), createBaseVNode("div", _hoisted_3$9, [(openBlock(true), createElementBlock(Fragment, null, renderList(plans.value, (plan) => {
					return openBlock(), createBlock(_sfc_main$14, {
						key: plan.filename,
						title: plan.title || plan.filename,
						subtitle: plan.filename,
						meta: fmtDate(plan.modified),
						active: activePlan.value === plan.filename,
						classes: ["plan-item"],
						onClick: ($event) => openPlan(plan)
					}, {
						leading: withCtx(() => [createBaseVNode("span", {
							class: "memory-brain-icon",
							innerHTML: planSvg
						})]),
						_: 1
					}, 8, [
						"title",
						"subtitle",
						"meta",
						"active",
						"onClick"
					]);
				}), 128))])]))]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/MemoryGroup.vue
	var _hoisted_1$11 = { class: "project-name" };
	var _hoisted_2$8 = { class: "memory-file-count" };
	var _hoisted_3$8 = { class: "project-sessions" };
	var _hoisted_4$7 = ["innerHTML"];
	var _hoisted_5$7 = ["onClick", "innerHTML"];
	var brainSvg = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z\"/><path d=\"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z\"/><path d=\"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4\"/><path d=\"M17.599 6.5a3 3 0 0 0 .399-1.375\"/><path d=\"M6.003 5.125A3 3 0 0 0 6.401 6.5\"/><path d=\"M3.477 10.896a4 4 0 0 1 .585-.396\"/><path d=\"M19.938 10.5a4 4 0 0 1 .585.396\"/><path d=\"M6 18a4 4 0 0 1-1.967-.516\"/><path d=\"M19.967 17.484A4 4 0 0 1 18 18\"/></svg>";
	var scheduleSvg = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/></svg>";
	var playSvg = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 384 512\" fill=\"currentColor\"><path d=\"M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z\"/></svg>";
	var spinnerSvg = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\"><path d=\"M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83\"/></svg>";
	var checkSvg = "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"/></svg>";
	var _sfc_main$12 = {
		__name: "MemoryGroup",
		props: {
			groupKey: {
				type: String,
				required: true
			},
			label: {
				type: String,
				required: true
			},
			files: {
				type: Array,
				required: true
			},
			activeFile: {
				type: String,
				default: null
			}
		},
		emits: ["open"],
		setup(__props, { emit: __emit }) {
			const collapsed = /* @__PURE__ */ ref(false);
			function toggle() {
				collapsed.value = !collapsed.value;
			}
			function fmtDate(d) {
				return window.formatDate ? window.formatDate(new Date(d)) : d;
			}
			function isSchedule(f) {
				return f.filename.startsWith("schedule-");
			}
			const runningFile = /* @__PURE__ */ ref(null);
			const doneFile = /* @__PURE__ */ ref(null);
			async function runSchedule(file) {
				runningFile.value = file.filePath;
				const result = await window.api.runScheduleNow(file.filePath);
				runningFile.value = null;
				doneFile.value = file.filePath;
				setTimeout(() => {
					doneFile.value = null;
				}, 2e3);
				if (result && !result.ok) console.error("Schedule run failed:", result.error);
			}
			function playIcon(file) {
				if (runningFile.value === file.filePath) return spinnerSvg;
				if (doneFile.value === file.filePath) return checkSvg;
				return playSvg;
			}
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", { class: normalizeClass(["project-group", { collapsed: collapsed.value }]) }, [createBaseVNode("div", {
					class: "project-header",
					onClick: toggle
				}, [
					_cache[0] || (_cache[0] = createBaseVNode("span", { class: "arrow" }, "▼", -1)),
					createBaseVNode("span", _hoisted_1$11, toDisplayString(__props.label), 1),
					createBaseVNode("span", _hoisted_2$8, toDisplayString(__props.files.length), 1)
				]), createBaseVNode("div", _hoisted_3$8, [(openBlock(true), createElementBlock(Fragment, null, renderList(__props.files, (file) => {
					return openBlock(), createBlock(_sfc_main$14, {
						key: file.filePath,
						title: file.filename,
						subtitle: file.displayPath,
						meta: fmtDate(file.modified),
						active: __props.activeFile === file.filePath,
						classes: ["memory-item"],
						"item-id": "mf-" + file.filePath.replace(/[^a-zA-Z0-9]/g, "_"),
						onClick: ($event) => _ctx.$emit("open", file)
					}, {
						leading: withCtx(() => [createBaseVNode("span", {
							class: normalizeClass(isSchedule(file) ? "memory-schedule-icon" : "memory-brain-icon"),
							innerHTML: isSchedule(file) ? scheduleSvg : brainSvg
						}, null, 10, _hoisted_4$7)]),
						trailing: withCtx(() => [isSchedule(file) ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: normalizeClass(["schedule-play-btn", {
								running: runningFile.value === file.filePath,
								done: doneFile.value === file.filePath
							}]),
							title: "Run now",
							onClick: withModifiers(($event) => runSchedule(file), ["stop"]),
							innerHTML: playIcon(file)
						}, null, 10, _hoisted_5$7)) : createCommentVNode("", true)]),
						_: 2
					}, 1032, [
						"title",
						"subtitle",
						"meta",
						"active",
						"item-id",
						"onClick"
					]);
				}), 128))])], 2);
			};
		}
	};
	//#endregion
	//#region src/vue/components/MemoryApp.vue
	var _hoisted_1$10 = {
		key: 0,
		class: "plans-empty"
	};
	var _sfc_main$11 = {
		__name: "MemoryApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props, { expose: __expose }) {
			const props = __props;
			const data = /* @__PURE__ */ ref({
				global: { files: [] },
				projects: []
			});
			const filterIds = /* @__PURE__ */ ref(null);
			const activeFile = /* @__PURE__ */ ref(null);
			const allFiles = computed(() => [...data.value.global.files, ...data.value.projects.flatMap((p) => p.files)]);
			const filteredGlobal = computed(() => {
				if (!filterIds.value) return data.value.global.files;
				return data.value.global.files.filter((f) => filterIds.value.has(f.filePath));
			});
			const filteredProjects = computed(() => {
				return data.value.projects.map((proj) => ({
					...proj,
					files: filterIds.value ? proj.files.filter((f) => filterIds.value.has(f.filePath)) : proj.files
				})).filter((proj) => proj.files.length > 0);
			});
			function openMemory(file) {
				activeFile.value = file.filePath;
				props.callbacks.openMemory?.(file);
			}
			__expose({
				setMemories(memData, ids = null) {
					data.value = memData;
					filterIds.value = ids;
				},
				setFilter(ids) {
					filterIds.value = ids;
				},
				setActive(filePath) {
					activeFile.value = filePath;
				},
				clearActive() {
					activeFile.value = null;
				}
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", null, [allFiles.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_1$10, " No memory files found. ")) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [data.value.global.files.length > 0 ? (openBlock(), createBlock(_sfc_main$12, {
					key: 0,
					"group-key": "__global__",
					label: "Global",
					files: filteredGlobal.value,
					"active-file": activeFile.value,
					onOpen: openMemory
				}, null, 8, ["files", "active-file"])) : createCommentVNode("", true), (openBlock(true), createElementBlock(Fragment, null, renderList(filteredProjects.value, (proj) => {
					return openBlock(), createBlock(_sfc_main$12, {
						key: proj.folder,
						"group-key": proj.folder,
						label: proj.shortName,
						files: proj.files,
						"active-file": activeFile.value,
						onOpen: openMemory
					}, null, 8, [
						"group-key",
						"label",
						"files",
						"active-file"
					]);
				}), 128))], 64))]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/AccountsApp.vue
	var _hoisted_1$9 = { class: "project-group" };
	var _hoisted_2$7 = { class: "project-sessions" };
	var _hoisted_3$7 = ["onClick"];
	var _hoisted_4$6 = { class: "session-row" };
	var _hoisted_5$6 = { class: "session-info" };
	var _hoisted_6$6 = ["onBlur", "onKeydown"];
	var _hoisted_7$5 = ["onDblclick"];
	var _hoisted_8$4 = { class: "session-subtitle" };
	var _hoisted_9$4 = {
		key: 2,
		class: "account-usage-block"
	};
	var _hoisted_10$4 = { class: "account-usage-label" };
	var _hoisted_11$4 = { class: "account-usage-bar" };
	var _hoisted_12$4 = { class: "account-usage-info" };
	var _hoisted_13$4 = {
		key: 0,
		class: "account-usage-cached-note"
	};
	var _hoisted_14$4 = { class: "account-card-actions" };
	var _hoisted_15$4 = ["onClick"];
	var _hoisted_16$4 = ["onClick"];
	var _hoisted_17$4 = ["onClick"];
	var _hoisted_18$3 = { class: "project-group" };
	var _hoisted_19$3 = { class: "project-sessions" };
	var _hoisted_20$3 = { class: "accounts-add-form" };
	var _hoisted_21$3 = ["disabled"];
	var editSvg = "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/></svg>";
	var trashSvg$1 = "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/><path d=\"M10 11v6M14 11v6\"/><path d=\"M9 6V4h6v2\"/></svg>";
	var _sfc_main$10 = {
		__name: "AccountsApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props, { expose: __expose }) {
			const props = __props;
			const accounts = /* @__PURE__ */ ref([]);
			const activeAccountId = /* @__PURE__ */ ref("default");
			const usage = /* @__PURE__ */ ref({});
			const editingId = /* @__PURE__ */ ref(null);
			const editName = /* @__PURE__ */ ref("");
			let activeEditInput = null;
			const newName = /* @__PURE__ */ ref("");
			const adding = /* @__PURE__ */ ref(false);
			function hasUsage(id) {
				const u = usage.value[id];
				if (!u || u._error || u._rateLimited) return false;
				return u.session != null || u.weekAll != null;
			}
			function usageRows(id) {
				const u = usage.value[id] || {};
				const rows = [];
				if (u.session != null) rows.push({
					key: "session",
					label: "5h",
					pct: u.session,
					resetIn: u.sessionResetIn
				});
				if (u.weekAll != null) rows.push({
					key: "weekAll",
					label: "7d",
					pct: u.weekAll,
					resetIn: u.weekAllResetIn
				});
				return rows;
			}
			async function startEdit(acc) {
				editingId.value = acc.id;
				editName.value = acc.name;
				activeEditInput = null;
				await nextTick();
				activeEditInput?.focus();
				activeEditInput?.select();
			}
			async function saveEdit(acc) {
				if (editingId.value !== acc.id) return;
				editingId.value = null;
				const newN = editName.value.trim() || acc.name;
				if (newN !== acc.name) {
					acc.name = newN;
					await props.callbacks.renameAccount?.(acc.id, newN);
				}
			}
			function cancelEdit() {
				editingId.value = null;
			}
			async function onSwitch(acc) {
				if (acc.id !== activeAccountId.value) await props.callbacks.switchAccount?.(acc.id);
			}
			function onOpenClaude(acc) {
				props.callbacks.openAccountHomeSession?.(acc);
			}
			async function onDelete(acc) {
				if (!confirm(`Remove account "${acc.name}"?`)) return;
				props.callbacks.deleteAccount?.(acc.id);
			}
			async function addAccount() {
				const name = newName.value.trim();
				if (!name) return;
				adding.value = true;
				const newAcc = await props.callbacks.createAccount?.(name);
				adding.value = false;
				if (newAcc) newName.value = "";
			}
			__expose({
				setAccounts(list, activeId) {
					accounts.value = list;
					if (activeId !== void 0) activeAccountId.value = activeId;
				},
				setActiveAccount(id) {
					activeAccountId.value = id;
				},
				setUsage(usageObj) {
					usage.value = { ...usageObj };
				}
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", null, [createBaseVNode("div", _hoisted_1$9, [_cache[3] || (_cache[3] = createBaseVNode("div", { class: "project-header" }, [createBaseVNode("span", { class: "project-name" }, "Accounts")], -1)), createBaseVNode("div", _hoisted_2$7, [(openBlock(true), createElementBlock(Fragment, null, renderList(accounts.value, (acc) => {
					return openBlock(), createElementBlock("div", {
						key: acc.id,
						class: normalizeClass(["session-item account-item", { active: acc.id === activeAccountId.value }]),
						onClick: ($event) => onSwitch(acc)
					}, [createBaseVNode("div", _hoisted_4$6, [createBaseVNode("div", _hoisted_5$6, [
						editingId.value === acc.id ? withDirectives((openBlock(), createElementBlock("input", {
							key: 0,
							class: "account-row-name-input",
							"onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => editName.value = $event),
							ref_for: true,
							ref: (el) => {
								if (el) /* @__PURE__ */ isRef(activeEditInput) ? activeEditInput.value = el : activeEditInput = el;
							},
							onBlur: ($event) => saveEdit(acc),
							onKeydown: [withKeys(withModifiers(($event) => saveEdit(acc), ["prevent"]), ["enter"]), withKeys(cancelEdit, ["escape"])],
							onClick: _cache[1] || (_cache[1] = withModifiers(() => {}, ["stop"]))
						}, null, 40, _hoisted_6$6)), [[vModelText, editName.value]]) : (openBlock(), createElementBlock("div", {
							key: 1,
							class: "session-summary",
							onDblclick: withModifiers(($event) => startEdit(acc), ["stop"])
						}, toDisplayString(acc.name), 41, _hoisted_7$5)),
						createBaseVNode("div", _hoisted_8$4, toDisplayString(acc.configDir || "~/.claude (default)"), 1),
						hasUsage(acc.id) ? (openBlock(), createElementBlock("div", _hoisted_9$4, [(openBlock(true), createElementBlock(Fragment, null, renderList(usageRows(acc.id), (row) => {
							return openBlock(), createElementBlock("div", {
								key: row.key,
								class: "account-usage-row"
							}, [
								createBaseVNode("span", _hoisted_10$4, toDisplayString(row.label), 1),
								createBaseVNode("div", _hoisted_11$4, [createBaseVNode("div", {
									class: normalizeClass(["account-usage-bar-fill", {
										danger: row.pct >= 90,
										warn: row.pct >= 70 && row.pct < 90
									}]),
									style: normalizeStyle({ width: Math.min(row.pct, 100) + "%" })
								}, null, 6)]),
								createBaseVNode("span", _hoisted_12$4, toDisplayString(row.pct) + "%" + toDisplayString(row.resetIn ? `  · resets in ${row.resetIn}~` : ""), 1)
							]);
						}), 128)), usage.value[acc.id]?._cached ? (openBlock(), createElementBlock("div", _hoisted_13$4, "cached data")) : createCommentVNode("", true)])) : createCommentVNode("", true)
					]), createBaseVNode("div", _hoisted_14$4, [
						editingId.value !== acc.id ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: "account-edit-btn",
							"data-tooltip": "Rename",
							onClick: withModifiers(($event) => startEdit(acc), ["stop"]),
							innerHTML: editSvg
						}, null, 8, _hoisted_15$4)) : createCommentVNode("", true),
						createBaseVNode("button", {
							class: "account-open-btn",
							"data-tooltip": "Open Claude session in home directory",
							onClick: withModifiers(($event) => onOpenClaude(acc), ["stop"])
						}, "Open Claude", 8, _hoisted_16$4),
						acc.id !== "default" ? (openBlock(), createElementBlock("button", {
							key: 1,
							class: "account-row-del",
							"data-tooltip": "Remove account",
							onClick: withModifiers(($event) => onDelete(acc), ["stop"]),
							innerHTML: trashSvg$1
						}, null, 8, _hoisted_17$4)) : createCommentVNode("", true)
					])])], 10, _hoisted_3$7);
				}), 128))])]), createBaseVNode("div", _hoisted_18$3, [_cache[5] || (_cache[5] = createBaseVNode("div", { class: "project-header" }, [createBaseVNode("span", { class: "project-name" }, "Add account")], -1)), createBaseVNode("div", _hoisted_19$3, [_cache[4] || (_cache[4] = createBaseVNode("p", { class: "accounts-add-desc" }, "Each account uses its own Claude credentials and session history. Add a second account to switch between personal and work Claude Pro plans, or any two separate logins.", -1)), createBaseVNode("div", _hoisted_20$3, [withDirectives(createBaseVNode("input", {
					"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => newName.value = $event),
					placeholder: "Account name (e.g. Work)",
					onKeydown: withKeys(addAccount, ["enter"])
				}, null, 544), [[vModelText, newName.value]]), createBaseVNode("button", {
					class: "accounts-add-btn",
					disabled: adding.value,
					onClick: addAccount
				}, toDisplayString(adding.value ? "Adding…" : "Add account"), 9, _hoisted_21$3)])])])]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/AccountDropdownApp.vue
	var _hoisted_1$8 = { class: "account-btn-name" };
	var _hoisted_2$6 = { class: "account-btn-chips" };
	var _hoisted_3$6 = {
		key: 0,
		class: "account-dropdown-vue"
	};
	var _hoisted_4$5 = ["onClick"];
	var _hoisted_5$5 = { class: "acct-dd-name" };
	var _hoisted_6$5 = { class: "acct-dd-chips" };
	var _sfc_main$9 = {
		__name: "AccountDropdownApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props, { expose: __expose }) {
			const props = __props;
			const accounts = /* @__PURE__ */ ref([]);
			const activeAccountId = /* @__PURE__ */ ref("default");
			const usage = /* @__PURE__ */ ref({});
			const open = /* @__PURE__ */ ref(false);
			const activeName = computed(() => {
				return accounts.value.find((a) => a.id === activeAccountId.value)?.name ?? "Default";
			});
			const activeChips = computed(() => chips(activeAccountId.value));
			function chips(id) {
				const u = usage.value[id];
				if (!u || u._error || u._rateLimited) return [];
				const out = [];
				if (u.session != null) out.push(`${u.session}% 5h`);
				return out;
			}
			function toggle() {
				open.value = !open.value;
			}
			function close() {
				open.value = false;
			}
			async function onSwitch(id) {
				close();
				if (id !== activeAccountId.value) await props.callbacks.switchAccount?.(id);
			}
			function onDocumentClick() {
				close();
			}
			onMounted(() => {
				document.addEventListener("click", onDocumentClick);
			});
			onUnmounted(() => {
				document.removeEventListener("click", onDocumentClick);
			});
			__expose({
				setAccounts(list, activeId, usageObj) {
					accounts.value = list;
					if (activeId !== void 0) activeAccountId.value = activeId;
					if (usageObj !== void 0) usage.value = usageObj;
				},
				setActiveAccount(id) {
					activeAccountId.value = id;
				},
				setUsage(usageObj) {
					usage.value = { ...usageObj };
				},
				close
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock(Fragment, null, [createBaseVNode("button", {
					class: "account-btn-vue",
					"data-tooltip": "Switch account",
					onClick: withModifiers(toggle, ["stop"])
				}, [
					_cache[0] || (_cache[0] = createBaseVNode("span", { class: "account-btn-dot" }, null, -1)),
					createBaseVNode("span", _hoisted_1$8, toDisplayString(activeName.value), 1),
					createBaseVNode("span", _hoisted_2$6, [(openBlock(true), createElementBlock(Fragment, null, renderList(activeChips.value, (chip) => {
						return openBlock(), createElementBlock("span", {
							key: chip,
							class: "account-chip"
						}, toDisplayString(chip), 1);
					}), 128))]),
					_cache[1] || (_cache[1] = createBaseVNode("svg", {
						width: "10",
						height: "6",
						viewBox: "0 0 10 6",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "1.5",
						"stroke-linecap": "round",
						"stroke-linejoin": "round"
					}, [createBaseVNode("path", { d: "M1 1l4 4 4-4" })], -1))
				]), open.value ? (openBlock(), createElementBlock("div", _hoisted_3$6, [(openBlock(true), createElementBlock(Fragment, null, renderList(accounts.value, (acc) => {
					return openBlock(), createElementBlock("div", {
						key: acc.id,
						class: normalizeClass(["acct-dd-item", { active: acc.id === activeAccountId.value }]),
						onClick: ($event) => onSwitch(acc.id)
					}, [
						_cache[2] || (_cache[2] = createBaseVNode("span", { class: "acct-dd-dot" }, null, -1)),
						createBaseVNode("span", _hoisted_5$5, toDisplayString(acc.name), 1),
						createBaseVNode("span", _hoisted_6$5, [(openBlock(true), createElementBlock(Fragment, null, renderList(chips(acc.id), (chip) => {
							return openBlock(), createElementBlock("span", {
								key: chip,
								class: "account-chip"
							}, toDisplayString(chip), 1);
						}), 128))])
					], 10, _hoisted_4$5);
				}), 128))])) : createCommentVNode("", true)], 64);
			};
		}
	};
	//#endregion
	//#region src/vue/components/ProjectsApp.vue
	var _hoisted_1$7 = { class: "project-group" };
	var _hoisted_2$5 = { class: "project-header" };
	var _hoisted_3$5 = { class: "project-name" };
	var _hoisted_4$4 = { class: "projects-sort-wrap" };
	var _hoisted_5$4 = ["onClick"];
	var _hoisted_6$4 = { class: "project-sessions" };
	var _hoisted_7$4 = {
		key: 0,
		class: "projects-empty-hint"
	};
	var _hoisted_8$3 = ["onClick"];
	var _hoisted_9$3 = { class: "session-row" };
	var _hoisted_10$3 = { class: "session-info" };
	var _hoisted_11$3 = { class: "session-summary" };
	var _hoisted_12$3 = { class: "project-item-name" };
	var _hoisted_13$3 = {
		key: 0,
		class: "project-unpushed-badge"
	};
	var _hoisted_14$3 = ["title"];
	var _hoisted_15$3 = { class: "session-meta" };
	var _hoisted_16$3 = {
		key: 0,
		class: "project-env-added"
	};
	var _hoisted_17$3 = {
		key: 1,
		class: "project-env-deleted"
	};
	var _hoisted_18$2 = {
		key: 0,
		class: "project-card-env"
	};
	var _hoisted_19$2 = { class: "project-env-containers-box" };
	var _hoisted_20$2 = { class: "project-env-containers-hdr" };
	var _hoisted_21$2 = { class: "project-env-cname" };
	var _hoisted_22$2 = { class: "project-env-cuptime" };
	var _hoisted_23$2 = ["onClick"];
	var _hoisted_24$2 = ["onClick"];
	var trashSvg = "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/><path d=\"M10 11v6M14 11v6\"/><path d=\"M9 6V4h6v2\"/></svg>";
	var _sfc_main$8 = {
		__name: "ProjectsApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props, { expose: __expose }) {
			const props = __props;
			const projects = /* @__PURE__ */ ref([]);
			const searchQuery = /* @__PURE__ */ ref("");
			const sortOrder = /* @__PURE__ */ ref("name");
			const projectInfo = /* @__PURE__ */ reactive({});
			const activeProjectPath = /* @__PURE__ */ ref(null);
			const sortOptions = [["name", "Name"], ["changes", "Changes"]];
			let queueGen = 0;
			const filteredProjects = computed(() => {
				const q = searchQuery.value.trim().toLowerCase();
				let list = q ? projects.value.filter((p) => {
					return (p.projectPath.split("/").filter(Boolean).pop() || "").toLowerCase().includes(q) || p.projectPath.toLowerCase().includes(q);
				}) : [...projects.value];
				if (sortOrder.value === "name") list.sort((a, b) => {
					const na = a.projectPath.split("/").filter(Boolean).pop() || "";
					const nb = b.projectPath.split("/").filter(Boolean).pop() || "";
					return na.localeCompare(nb);
				});
				else list.sort((a, b) => {
					const ia = projectInfo[a.projectPath];
					const ib = projectInfo[b.projectPath];
					const sa = (ia?.added || 0) + (ia?.deleted || 0);
					return (ib?.added || 0) + (ib?.deleted || 0) - sa;
				});
				return list;
			});
			function projectName(p) {
				return p.projectPath.split("/").filter(Boolean).pop() || p.projectPath;
			}
			function avatar(p) {
				return window.getProjectAvatar ? window.getProjectAvatar(p.projectPath) : {
					initials: "?",
					color: "#888"
				};
			}
			function baseMeta(p) {
				const n = p.sessions.length;
				const last = p.sessions[0];
				const activity = last ? window.formatDate ? window.formatDate(new Date(last.modified)) : last.modified : "—";
				return `${n} session${n !== 1 ? "s" : ""} · ${activity}`;
			}
			function parseUptime(status) {
				return window.parseContainerUptime ? window.parseContainerUptime(status) : "";
			}
			function openProject(project) {
				activeProjectPath.value = project.projectPath;
				props.callbacks.openProject?.(project);
			}
			async function removeProject(project) {
				const name = project.projectPath.split("/").pop();
				if (!confirm(`Remove "${name}" from the project list?\n\nSession files are not deleted.`)) return;
				await window.api.removeProject(project.projectPath);
				props.callbacks.projectRemoved?.();
			}
			async function runInfoQueue(gen, list) {
				for (const project of list) {
					if (queueGen !== gen) break;
					try {
						const info = await window.api.getProjectInfo(project.projectPath);
						if (queueGen !== gen) break;
						if (info) projectInfo[project.projectPath] = info;
					} catch {}
				}
			}
			__expose({
				setProjects(list) {
					projects.value = list;
					queueGen++;
					runInfoQueue(queueGen, list);
				},
				setSearch(q) {
					searchQuery.value = q || "";
				},
				clearActive() {
					activeProjectPath.value = null;
				}
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", null, [createBaseVNode("div", _hoisted_1$7, [createBaseVNode("div", _hoisted_2$5, [
					createBaseVNode("span", _hoisted_3$5, "Projects (" + toDisplayString(filteredProjects.value.length) + ")", 1),
					createBaseVNode("button", {
						class: "project-new-btn",
						"data-tooltip": "Add",
						onClick: _cache[0] || (_cache[0] = ($event) => __props.callbacks.addProject?.())
					}, [..._cache[2] || (_cache[2] = [createBaseVNode("svg", {
						width: "11",
						height: "11",
						viewBox: "0 0 12 12",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "1.8",
						"stroke-linecap": "round"
					}, [createBaseVNode("line", {
						x1: "6",
						y1: "1",
						x2: "6",
						y2: "11"
					}), createBaseVNode("line", {
						x1: "1",
						y1: "6",
						x2: "11",
						y2: "6"
					})], -1)])]),
					createBaseVNode("div", _hoisted_4$4, [(openBlock(), createElementBlock(Fragment, null, renderList(sortOptions, ([key, label]) => {
						return createBaseVNode("button", {
							key,
							class: normalizeClass(["projects-sort-btn", { active: sortOrder.value === key }]),
							onClick: ($event) => sortOrder.value = key
						}, toDisplayString(label), 11, _hoisted_5$4);
					}), 64))])
				]), createBaseVNode("div", _hoisted_6$4, [filteredProjects.value.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_7$4, toDisplayString(searchQuery.value ? "No matching projects." : "No projects yet. Click Add to select a folder."), 1)) : createCommentVNode("", true), (openBlock(true), createElementBlock(Fragment, null, renderList(filteredProjects.value, (project) => {
					return openBlock(), createElementBlock("div", {
						key: project.projectPath,
						class: normalizeClass(["session-item project-item", { active: project.projectPath === activeProjectPath.value }]),
						onClick: ($event) => openProject(project)
					}, [createBaseVNode("div", _hoisted_9$3, [
						createBaseVNode("span", {
							class: "project-card-avatar",
							style: normalizeStyle({ background: avatar(project).color })
						}, toDisplayString(avatar(project).initials), 5),
						createBaseVNode("div", _hoisted_10$3, [
							createBaseVNode("div", _hoisted_11$3, [createBaseVNode("span", _hoisted_12$3, toDisplayString(projectName(project)), 1), project.unpushedCount ? (openBlock(), createElementBlock("span", _hoisted_13$3, toDisplayString(project.unpushedCount), 1)) : createCommentVNode("", true)]),
							createBaseVNode("div", {
								class: "session-subtitle",
								title: project.projectPath
							}, toDisplayString(project.projectPath), 9, _hoisted_14$3),
							createBaseVNode("div", _hoisted_15$3, [createTextVNode(toDisplayString(baseMeta(project)), 1), projectInfo[project.projectPath]?.branch ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
								_cache[3] || (_cache[3] = createTextVNode(" \xA0·\xA0", -1)),
								_cache[4] || (_cache[4] = createBaseVNode("span", { class: "project-env-branch-icon" }, "⎇", -1)),
								createTextVNode(" " + toDisplayString(projectInfo[project.projectPath].branch) + " ", 1),
								projectInfo[project.projectPath].added ? (openBlock(), createElementBlock("span", _hoisted_16$3, " +" + toDisplayString(projectInfo[project.projectPath].added), 1)) : createCommentVNode("", true),
								projectInfo[project.projectPath].deleted ? (openBlock(), createElementBlock("span", _hoisted_17$3, " −" + toDisplayString(projectInfo[project.projectPath].deleted), 1)) : createCommentVNode("", true)
							], 64)) : createCommentVNode("", true)]),
							projectInfo[project.projectPath]?.containers?.length ? (openBlock(), createElementBlock("div", _hoisted_18$2, [createBaseVNode("div", _hoisted_19$2, [createBaseVNode("div", _hoisted_20$2, [_cache[5] || (_cache[5] = createBaseVNode("svg", {
								width: "12",
								height: "12",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								"stroke-width": "2"
							}, [createBaseVNode("rect", {
								x: "2",
								y: "7",
								width: "20",
								height: "14",
								rx: "2"
							}), createBaseVNode("path", { d: "M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2" })], -1)), createTextVNode(" CONTAINERS · " + toDisplayString(projectInfo[project.projectPath].containers.length), 1)]), (openBlock(true), createElementBlock(Fragment, null, renderList(projectInfo[project.projectPath].containers, (c) => {
								return openBlock(), createElementBlock("div", {
									key: c.name,
									class: "project-env-container-row"
								}, [
									createBaseVNode("span", { class: normalizeClass(["project-env-dot", {
										running: c.state.includes("running"),
										starting: !c.state.includes("running") && (c.state.includes("starting") || c.status?.toLowerCase().includes("starting"))
									}]) }, null, 2),
									createBaseVNode("span", _hoisted_21$2, toDisplayString(c.name), 1),
									createBaseVNode("span", _hoisted_22$2, toDisplayString(parseUptime(c.status)), 1),
									!c.state.includes("running") && c.state && c.state !== "exited" ? (openBlock(), createElementBlock("span", {
										key: 0,
										class: normalizeClass(["project-env-cbadge", { starting: c.state.includes("starting") || c.status?.toLowerCase().includes("starting") }])
									}, toDisplayString(c.state), 3)) : createCommentVNode("", true)
								]);
							}), 128))])])) : createCommentVNode("", true)
						]),
						createBaseVNode("div", {
							class: "project-card-actions",
							onClick: _cache[1] || (_cache[1] = withModifiers(() => {}, ["stop"]))
						}, [createBaseVNode("button", {
							class: "project-card-new-btn",
							"data-tooltip": "New session",
							onClick: withModifiers(($event) => __props.callbacks.newSession?.(project), ["stop"])
						}, [..._cache[6] || (_cache[6] = [createBaseVNode("svg", {
							width: "13",
							height: "13",
							viewBox: "0 0 12 12",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "1.8",
							"stroke-linecap": "round"
						}, [createBaseVNode("line", {
							x1: "6",
							y1: "1",
							x2: "6",
							y2: "11"
						}), createBaseVNode("line", {
							x1: "1",
							y1: "6",
							x2: "11",
							y2: "6"
						})], -1)])], 8, _hoisted_23$2), createBaseVNode("button", {
							class: "project-card-del-btn",
							"data-tooltip": "Remove project",
							onClick: withModifiers(($event) => removeProject(project), ["stop"]),
							innerHTML: trashSvg
						}, null, 8, _hoisted_24$2)])
					])], 10, _hoisted_8$3);
				}), 128))])])]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/StatusBarApp.vue
	var _sfc_main$7 = {
		__name: "StatusBarApp",
		setup(__props, { expose: __expose }) {
			const info = /* @__PURE__ */ ref("");
			const activity = /* @__PURE__ */ ref("");
			const activityClass = /* @__PURE__ */ ref("");
			const updater = /* @__PURE__ */ ref("");
			let activityTimer = null;
			let updaterTimer = null;
			__expose({
				setInfo(text) {
					info.value = text;
				},
				setActivity(text, type) {
					if (activityTimer) clearTimeout(activityTimer);
					activity.value = text;
					activityClass.value = type === "done" ? "status-done" : "";
					if (!text || type === "done") activityTimer = setTimeout(() => {
						activity.value = "";
						activityClass.value = "";
					}, type === "done" ? 3e3 : 0);
				},
				setUpdater(text, duration) {
					if (updaterTimer) clearTimeout(updaterTimer);
					updater.value = text;
					if (duration) updaterTimer = setTimeout(() => {
						updater.value = "";
					}, duration);
				}
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock(Fragment, null, [
					createBaseVNode("span", null, toDisplayString(info.value), 1),
					createBaseVNode("span", { class: normalizeClass(activityClass.value) }, toDisplayString(activity.value), 3),
					createBaseVNode("span", null, toDisplayString(updater.value), 1)
				], 64);
			};
		}
	};
	//#endregion
	//#region src/vue/components/GridCardsApp.vue
	var _hoisted_1$6 = { class: "grid-card-name" };
	var _hoisted_2$4 = { class: "grid-card-project" };
	var _hoisted_3$4 = ["onClick"];
	var _sfc_main$6 = {
		__name: "GridCardsApp",
		setup(__props, { expose: __expose }) {
			const activeCards = /* @__PURE__ */ reactive(/* @__PURE__ */ new Map());
			function stop(sessionId) {
				window.confirmAndStopSession?.(sessionId);
			}
			__expose({
				addCard(sessionId, headerEl, footerEl, { name, project, initials, color, running, busy, time }) {
					activeCards.set(sessionId, {
						headerEl,
						footerEl,
						name,
						project,
						initials,
						color,
						running: !!running,
						busy: !!busy,
						time: time || ""
					});
				},
				updateCard(sessionId, running, busy, time) {
					const card = activeCards.get(sessionId);
					if (!card) return;
					card.running = !!running;
					card.busy = !!busy;
					if (time !== void 0) card.time = time;
				},
				removeCard(sessionId) {
					activeCards.delete(sessionId);
				},
				clearAll() {
					activeCards.clear();
				}
			});
			return (_ctx, _cache) => {
				return openBlock(true), createElementBlock(Fragment, null, renderList(activeCards, ([sessionId, card]) => {
					return openBlock(), createElementBlock(Fragment, { key: sessionId }, [(openBlock(), createBlock(Teleport, { to: card.headerEl }, [
						createBaseVNode("span", {
							class: normalizeClass(["grid-card-avatar", card.busy ? "busy" : card.running ? "running" : "stopped"]),
							style: normalizeStyle({ background: card.color })
						}, toDisplayString(card.initials), 7),
						createBaseVNode("span", _hoisted_1$6, toDisplayString(card.name), 1),
						createBaseVNode("span", _hoisted_2$4, toDisplayString(card.project), 1),
						card.running ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: "grid-card-stop-btn",
							"data-tooltip": "Stop session",
							onClick: withModifiers(($event) => stop(sessionId), ["stop"])
						}, [..._cache[0] || (_cache[0] = [createBaseVNode("svg", {
							width: "10",
							height: "10",
							viewBox: "0 0 12 12",
							fill: "currentColor"
						}, [createBaseVNode("rect", {
							x: "2",
							y: "2",
							width: "8",
							height: "8",
							rx: "1"
						})], -1)])], 8, _hoisted_3$4)) : createCommentVNode("", true)
					], 8, ["to"])), (openBlock(), createBlock(Teleport, { to: card.footerEl }, [createBaseVNode("span", null, toDisplayString(card.running ? "Running" : "Stopped"), 1), createBaseVNode("span", null, toDisplayString(card.time), 1)], 8, ["to"]))], 64);
				}), 128);
			};
		}
	};
	//#endregion
	//#region src/vue/components/SbSwitch.vue
	var _hoisted_1$5 = ["aria-checked", "disabled"];
	var _sfc_main$5 = {
		__name: "SbSwitch",
		props: {
			modelValue: {
				type: Boolean,
				default: false
			},
			disabled: {
				type: Boolean,
				default: false
			}
		},
		emits: ["update:modelValue"],
		setup(__props, { emit: __emit }) {
			const props = __props;
			const emit = __emit;
			function toggle() {
				if (!props.disabled) emit("update:modelValue", !props.modelValue);
			}
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("button", {
					type: "button",
					role: "switch",
					"aria-checked": __props.modelValue,
					disabled: __props.disabled,
					class: normalizeClass(["sb-switch", { "sb-switch--on": __props.modelValue }]),
					onClick: toggle
				}, [..._cache[0] || (_cache[0] = [createBaseVNode("span", { class: "sb-switch-thumb" }, null, -1)])], 10, _hoisted_1$5);
			};
		}
	};
	//#endregion
	//#region src/vue/components/SbButton.vue
	var _hoisted_1$4 = ["type", "disabled"];
	var _sfc_main$4 = {
		__name: "SbButton",
		props: {
			variant: {
				type: String,
				default: "secondary"
			},
			size: {
				type: String,
				default: "md"
			},
			type: {
				type: String,
				default: "button"
			},
			disabled: {
				type: Boolean,
				default: false
			}
		},
		emits: ["click"],
		setup(__props) {
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("button", {
					type: __props.type,
					disabled: __props.disabled,
					class: normalizeClass(["sb-btn", [`sb-btn--${__props.variant}`, `sb-btn--${__props.size}`]]),
					onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("click", $event))
				}, [renderSlot(_ctx.$slots, "icon"), renderSlot(_ctx.$slots, "default")], 10, _hoisted_1$4);
			};
		}
	};
	//#endregion
	//#region src/vue/components/SettingsPanelApp.vue
	var _hoisted_1$3 = { class: "settings-panel" };
	var _hoisted_2$3 = { class: "settings-panel-header" };
	var _hoisted_3$3 = { class: "settings-panel-title" };
	var _hoisted_4$3 = { class: "settings-panel-body" };
	var _hoisted_5$3 = {
		key: 0,
		class: "settings-loading"
	};
	var _hoisted_6$3 = {
		key: 1,
		class: "settings-form"
	};
	var _hoisted_7$3 = { class: "settings-section" };
	var _hoisted_8$2 = { class: "settings-field" };
	var _hoisted_9$2 = { class: "settings-field-info" };
	var _hoisted_10$2 = { class: "settings-field-header" };
	var _hoisted_11$2 = {
		key: 0,
		class: "settings-use-global"
	};
	var _hoisted_12$2 = ["checked"];
	var _hoisted_13$2 = { class: "settings-field-control" };
	var _hoisted_14$2 = ["disabled"];
	var _hoisted_15$2 = { class: "settings-field" };
	var _hoisted_16$2 = { class: "settings-field-info" };
	var _hoisted_17$2 = { class: "settings-field-header" };
	var _hoisted_18$1 = {
		key: 0,
		class: "settings-use-global"
	};
	var _hoisted_19$1 = ["checked"];
	var _hoisted_20$1 = { class: "settings-field-control" };
	var _hoisted_21$1 = { class: "settings-field" };
	var _hoisted_22$1 = { class: "settings-field-info" };
	var _hoisted_23$1 = { class: "settings-field-header" };
	var _hoisted_24$1 = {
		key: 0,
		class: "settings-use-global"
	};
	var _hoisted_25$1 = ["checked"];
	var _hoisted_26$1 = { class: "settings-field-control" };
	var _hoisted_27$1 = ["disabled"];
	var _hoisted_28$1 = { class: "settings-field" };
	var _hoisted_29$1 = { class: "settings-field-info" };
	var _hoisted_30$1 = { class: "settings-field-header" };
	var _hoisted_31$1 = {
		key: 0,
		class: "settings-use-global"
	};
	var _hoisted_32$1 = ["checked"];
	var _hoisted_33$1 = { class: "settings-field-control" };
	var _hoisted_34$1 = { class: "settings-field settings-field-wide" };
	var _hoisted_35$1 = { class: "settings-field-info" };
	var _hoisted_36$1 = { class: "settings-field-header" };
	var _hoisted_37$1 = {
		key: 0,
		class: "settings-use-global"
	};
	var _hoisted_38$1 = ["checked"];
	var _hoisted_39$1 = { class: "settings-field-control" };
	var _hoisted_40$1 = ["disabled"];
	var _hoisted_41$1 = { class: "settings-section" };
	var _hoisted_42$1 = { class: "settings-field settings-field-wide" };
	var _hoisted_43$1 = { class: "settings-field-info" };
	var _hoisted_44$1 = { class: "settings-field-header" };
	var _hoisted_45$1 = {
		key: 0,
		class: "settings-use-global"
	};
	var _hoisted_46$1 = ["checked"];
	var _hoisted_47$1 = { class: "settings-field-control" };
	var _hoisted_48$1 = ["disabled"];
	var _hoisted_49$1 = { class: "settings-section" };
	var _hoisted_50$1 = { class: "settings-field" };
	var _hoisted_51$1 = { class: "settings-field-control" };
	var _hoisted_52$1 = ["value"];
	var _hoisted_53$1 = { class: "settings-field settings-field-wide" };
	var _hoisted_54$1 = { class: "settings-field-control settings-font-control" };
	var _hoisted_55$1 = ["value"];
	var _hoisted_56$1 = { class: "settings-field settings-field-wide" };
	var _hoisted_57$1 = { class: "settings-field-control settings-font-control" };
	var _hoisted_58$1 = ["value"];
	var _hoisted_59$1 = { class: "settings-field" };
	var _hoisted_60$1 = { class: "settings-field-control" };
	var _hoisted_61$1 = ["value"];
	var _hoisted_62$1 = { class: "settings-field" };
	var _hoisted_63$1 = { class: "settings-field-control" };
	var _hoisted_64$1 = { class: "settings-field" };
	var _hoisted_65$1 = { class: "settings-field-control" };
	var _hoisted_66$1 = { class: "settings-field" };
	var _hoisted_67$1 = { class: "settings-field-control" };
	var _hoisted_68$1 = { class: "settings-field" };
	var _hoisted_69$1 = { class: "settings-field-control" };
	var _hoisted_70$1 = { class: "settings-section" };
	var _hoisted_71$1 = { class: "settings-field settings-field--column" };
	var _hoisted_72$1 = { class: "settings-field-control settings-field-control--full" };
	var _hoisted_73$1 = { class: "settings-section" };
	var _hoisted_74$1 = { class: "settings-field" };
	var _hoisted_75$1 = { class: "settings-field-info" };
	var _hoisted_76$1 = { class: "settings-description" };
	var _hoisted_77$1 = { key: 0 };
	var _hoisted_78$1 = {
		key: 1,
		class: "settings-update-status"
	};
	var _hoisted_79$1 = { class: "settings-field-control" };
	var _hoisted_80$1 = { class: "settings-btn-row" };
	var _hoisted_81$1 = {
		key: 1,
		class: "settings-notice"
	};
	var COMMIT_MSG_PROMPT_DEFAULT = `Write a concise git commit message (max 72 chars for first line) for these changes. Use conventional commit format (feat/fix/refactor/docs/chore). Output ONLY the commit message, no explanation:`;
	var _sfc_main$3 = {
		__name: "SettingsPanelApp",
		setup(__props) {
			const isProject = computed(() => store.settingsScope === "project");
			const projectPath = computed(() => store.settingsProjectPath);
			const settingsKey = computed(() => isProject.value ? "project:" + projectPath.value : "global");
			const title = computed(() => {
				const shortName = isProject.value ? projectPath.value?.split("/").filter(Boolean).slice(-2).join("/") || projectPath.value : "Global";
				return (isProject.value ? "Project Settings — " : "Global Settings — ") + shortName;
			});
			const loading = /* @__PURE__ */ ref(true);
			const saveState = /* @__PURE__ */ ref("idle");
			const ideNotice = /* @__PURE__ */ ref("");
			const appVersion = /* @__PURE__ */ ref("");
			const updateStatus = /* @__PURE__ */ ref("");
			const shellProfiles = /* @__PURE__ */ ref([]);
			const terminalThemes = computed(() => window.TERMINAL_THEMES || {});
			const terminalFonts = computed(() => window.TERMINAL_FONTS || {});
			const form = /* @__PURE__ */ reactive({
				permissionMode: "",
				worktree: false,
				worktreeName: "",
				chrome: false,
				preLaunchCmd: "",
				addDirs: "",
				visibleSessionCount: 10,
				sessionMaxAgeDays: 3,
				terminalTheme: "switchboard",
				mcpEmulation: true,
				shellProfile: "auto",
				showAvatars: true,
				monoFont: "default",
				uiFont: "default",
				commitMessagePrompt: ""
			});
			const useGlobal = /* @__PURE__ */ reactive({
				permissionMode: true,
				worktree: true,
				worktreeName: true,
				chrome: true,
				preLaunchCmd: true,
				addDirs: true
			});
			let originalMcpEmulation = true;
			function effectiveValue(current, global, field, fallback) {
				if (isProject.value && (current[field] === void 0 || current[field] === null)) return global[field] !== void 0 ? global[field] : fallback;
				return current[field] !== void 0 ? current[field] : fallback;
			}
			function isUsingGlobal(current, field) {
				return current[field] === void 0 || current[field] === null;
			}
			async function loadSettings() {
				loading.value = true;
				const current = await window.api.getSetting(settingsKey.value) || {};
				const global = isProject.value ? await window.api.getSetting("global") || {} : {};
				for (const field of [
					"permissionMode",
					"worktree",
					"worktreeName",
					"chrome",
					"preLaunchCmd",
					"addDirs"
				]) {
					if (isProject.value) useGlobal[field] = isUsingGlobal(current, field);
					form[field] = effectiveValue(current, global, field, getDefault(field));
				}
				if (!isProject.value) {
					form.visibleSessionCount = current.visibleSessionCount ?? 10;
					form.sessionMaxAgeDays = current.sessionMaxAgeDays ?? 3;
					form.terminalTheme = current.terminalTheme ?? "switchboard";
					form.mcpEmulation = current.mcpEmulation !== false;
					form.shellProfile = current.shellProfile ?? "auto";
					form.showAvatars = current.showAvatars !== false;
					form.monoFont = current.monoFont ?? "default";
					form.uiFont = current.uiFont ?? "default";
					form.commitMessagePrompt = current.commitMessagePrompt || COMMIT_MSG_PROMPT_DEFAULT;
					originalMcpEmulation = form.mcpEmulation;
					try {
						shellProfiles.value = await window.api.getShellProfiles();
					} catch {
						shellProfiles.value = [];
					}
					window.api.getAppVersion().then((v) => {
						appVersion.value = v;
					});
				}
				loading.value = false;
			}
			function getDefault(field) {
				return {
					permissionMode: "",
					worktree: false,
					worktreeName: "",
					chrome: false,
					preLaunchCmd: "",
					addDirs: ""
				}[field];
			}
			function toggleGlobal(field, checked) {
				useGlobal[field] = checked;
			}
			async function save() {
				let settings = {};
				if (isProject.value) {
					for (const field of [
						"permissionMode",
						"worktree",
						"worktreeName",
						"chrome",
						"preLaunchCmd",
						"addDirs"
					]) if (!useGlobal[field]) settings[field] = form[field];
				} else settings = {
					...await window.api.getSetting("global") || {},
					permissionMode: form.permissionMode || null,
					worktree: form.worktree,
					worktreeName: form.worktreeName,
					chrome: form.chrome,
					preLaunchCmd: form.preLaunchCmd,
					addDirs: form.addDirs,
					visibleSessionCount: form.visibleSessionCount || 10,
					sessionMaxAgeDays: form.sessionMaxAgeDays || 3,
					terminalTheme: form.terminalTheme || "switchboard",
					mcpEmulation: form.mcpEmulation,
					shellProfile: form.shellProfile || "auto",
					showAvatars: form.showAvatars,
					monoFont: form.monoFont || "default",
					uiFont: form.uiFont || "default",
					commitMessagePrompt: form.commitMessagePrompt === COMMIT_MSG_PROMPT_DEFAULT ? "" : form.commitMessagePrompt || ""
				};
				await window.api.setSetting(settingsKey.value, settings);
				if (!isProject.value) {
					window._setVisibleSessionCount?.(settings.visibleSessionCount);
					window._setSessionMaxAge?.(settings.sessionMaxAgeDays);
					window._applyTerminalTheme?.(settings.terminalTheme);
					window._setShowAvatars?.(settings.showAvatars);
					if (window.TERMINAL_FONTS?.[settings.monoFont]) window._applyTerminalFont?.(window.TERMINAL_FONTS[settings.monoFont].family);
					window._applyUiFont?.(settings.uiFont);
					if (typeof refreshSidebar === "function") refreshSidebar();
					if (settings.mcpEmulation !== originalMcpEmulation) {
						ideNotice.value = "IDE Emulation setting changed. New sessions will use the updated setting — running sessions are not affected.";
						setTimeout(() => {
							ideNotice.value = "";
						}, 8e3);
					}
				}
				saveState.value = "saved";
				setTimeout(() => close(), 600);
			}
			function close() {
				store.settingsOpen = false;
				window._restoreAfterSettings?.();
			}
			async function removeProject() {
				const shortName = projectPath.value?.split("/").filter(Boolean).slice(-2).join("/") || projectPath.value;
				if (!confirm(`Hide project "${shortName}" from Switchboard?\n\nThis hides the project from the sidebar. Your session files are not deleted.`)) return;
				await window.api.removeProject(projectPath.value);
				store.settingsOpen = false;
				if (typeof loadProjects === "function") loadProjects();
			}
			function checkUpdates() {
				window.api.updaterCheck();
			}
			onMounted(async () => {
				await loadSettings();
				if (!isProject.value) window.api.onUpdaterEvent((type, data) => {
					switch (type) {
						case "checking":
							updateStatus.value = "checking…";
							break;
						case "update-available":
							updateStatus.value = `v${data.version} available`;
							break;
						case "update-not-available":
							updateStatus.value = "up to date";
							break;
						case "download-progress":
							updateStatus.value = `downloading ${Math.round(data.percent)}%`;
							break;
						case "update-downloaded":
							updateStatus.value = `v${data.version} ready, restart to update`;
							break;
						case "error":
							updateStatus.value = "check failed";
							break;
					}
				});
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock("div", _hoisted_1$3, [createBaseVNode("div", _hoisted_2$3, [createBaseVNode("span", _hoisted_3$3, toDisplayString(title.value), 1)]), createBaseVNode("div", _hoisted_4$3, [loading.value ? (openBlock(), createElementBlock("div", _hoisted_5$3, "Loading…")) : (openBlock(), createElementBlock("div", _hoisted_6$3, [
					createBaseVNode("div", _hoisted_7$3, [
						_cache[38] || (_cache[38] = createBaseVNode("div", { class: "settings-section-title" }, "Claude CLI Options", -1)),
						createBaseVNode("div", _hoisted_8$2, [createBaseVNode("div", _hoisted_9$2, [createBaseVNode("div", _hoisted_10$2, [_cache[23] || (_cache[23] = createBaseVNode("span", { class: "settings-label" }, "Permission Mode", -1)), isProject.value ? (openBlock(), createElementBlock("label", _hoisted_11$2, [createBaseVNode("input", {
							type: "checkbox",
							checked: useGlobal.permissionMode,
							onChange: _cache[0] || (_cache[0] = ($event) => toggleGlobal("permissionMode", $event.target.checked))
						}, null, 40, _hoisted_12$2), _cache[22] || (_cache[22] = createTextVNode(" Use global default ", -1))])) : createCommentVNode("", true)]), _cache[24] || (_cache[24] = createBaseVNode("div", { class: "settings-description" }, [
							createTextVNode("Permission mode passed to the "),
							createBaseVNode("code", null, "claude"),
							createTextVNode(" command")
						], -1))]), createBaseVNode("div", _hoisted_13$2, [withDirectives(createBaseVNode("select", {
							class: "settings-select",
							"onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => form.permissionMode = $event),
							disabled: isProject.value && useGlobal.permissionMode
						}, [..._cache[25] || (_cache[25] = [createStaticVNode("<option value=\"\">Default (none)</option><option value=\"acceptEdits\">Accept Edits</option><option value=\"plan\">Plan Mode</option><option value=\"dontAsk\">Don&#39;t Ask</option><option value=\"bypassPermissions\">Bypass</option>", 5)])], 8, _hoisted_14$2), [[vModelSelect, form.permissionMode]])])]),
						createBaseVNode("div", _hoisted_15$2, [createBaseVNode("div", _hoisted_16$2, [createBaseVNode("div", _hoisted_17$2, [_cache[27] || (_cache[27] = createBaseVNode("span", { class: "settings-label" }, "Worktree", -1)), isProject.value ? (openBlock(), createElementBlock("label", _hoisted_18$1, [createBaseVNode("input", {
							type: "checkbox",
							checked: useGlobal.worktree,
							onChange: _cache[2] || (_cache[2] = ($event) => toggleGlobal("worktree", $event.target.checked))
						}, null, 40, _hoisted_19$1), _cache[26] || (_cache[26] = createTextVNode(" Use global default ", -1))])) : createCommentVNode("", true)]), _cache[28] || (_cache[28] = createBaseVNode("div", { class: "settings-description" }, "Enable worktree for new sessions", -1))]), createBaseVNode("div", _hoisted_20$1, [createVNode(_sfc_main$5, {
							modelValue: form.worktree,
							"onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => form.worktree = $event),
							disabled: isProject.value && useGlobal.worktree
						}, null, 8, ["modelValue", "disabled"])])]),
						createBaseVNode("div", _hoisted_21$1, [createBaseVNode("div", _hoisted_22$1, [createBaseVNode("div", _hoisted_23$1, [_cache[30] || (_cache[30] = createBaseVNode("span", { class: "settings-label" }, "Worktree Name", -1)), isProject.value ? (openBlock(), createElementBlock("label", _hoisted_24$1, [createBaseVNode("input", {
							type: "checkbox",
							checked: useGlobal.worktreeName,
							onChange: _cache[4] || (_cache[4] = ($event) => toggleGlobal("worktreeName", $event.target.checked))
						}, null, 40, _hoisted_25$1), _cache[29] || (_cache[29] = createTextVNode(" Use global default ", -1))])) : createCommentVNode("", true)]), _cache[31] || (_cache[31] = createBaseVNode("div", { class: "settings-description" }, "Custom name for worktree branches", -1))]), createBaseVNode("div", _hoisted_26$1, [withDirectives(createBaseVNode("input", {
							type: "text",
							class: "settings-input",
							"onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => form.worktreeName = $event),
							placeholder: "auto",
							disabled: isProject.value && useGlobal.worktreeName,
							style: { "width": "140px" }
						}, null, 8, _hoisted_27$1), [[vModelText, form.worktreeName]])])]),
						createBaseVNode("div", _hoisted_28$1, [createBaseVNode("div", _hoisted_29$1, [createBaseVNode("div", _hoisted_30$1, [_cache[33] || (_cache[33] = createBaseVNode("span", { class: "settings-label" }, "Chrome", -1)), isProject.value ? (openBlock(), createElementBlock("label", _hoisted_31$1, [createBaseVNode("input", {
							type: "checkbox",
							checked: useGlobal.chrome,
							onChange: _cache[6] || (_cache[6] = ($event) => toggleGlobal("chrome", $event.target.checked))
						}, null, 40, _hoisted_32$1), _cache[32] || (_cache[32] = createTextVNode(" Use global default ", -1))])) : createCommentVNode("", true)]), _cache[34] || (_cache[34] = createBaseVNode("div", { class: "settings-description" }, "Enable Chrome browser automation", -1))]), createBaseVNode("div", _hoisted_33$1, [createVNode(_sfc_main$5, {
							modelValue: form.chrome,
							"onUpdate:modelValue": _cache[7] || (_cache[7] = ($event) => form.chrome = $event),
							disabled: isProject.value && useGlobal.chrome
						}, null, 8, ["modelValue", "disabled"])])]),
						createBaseVNode("div", _hoisted_34$1, [createBaseVNode("div", _hoisted_35$1, [createBaseVNode("div", _hoisted_36$1, [_cache[36] || (_cache[36] = createBaseVNode("span", { class: "settings-label" }, "Additional Directories", -1)), isProject.value ? (openBlock(), createElementBlock("label", _hoisted_37$1, [createBaseVNode("input", {
							type: "checkbox",
							checked: useGlobal.addDirs,
							onChange: _cache[8] || (_cache[8] = ($event) => toggleGlobal("addDirs", $event.target.checked))
						}, null, 40, _hoisted_38$1), _cache[35] || (_cache[35] = createTextVNode(" Use global default ", -1))])) : createCommentVNode("", true)]), _cache[37] || (_cache[37] = createBaseVNode("div", { class: "settings-description" }, "Extra directories to include in Claude sessions", -1))]), createBaseVNode("div", _hoisted_39$1, [withDirectives(createBaseVNode("input", {
							type: "text",
							class: "settings-input",
							"onUpdate:modelValue": _cache[9] || (_cache[9] = ($event) => form.addDirs = $event),
							placeholder: "/path/to/dir1, /path/to/dir2",
							disabled: isProject.value && useGlobal.addDirs
						}, null, 8, _hoisted_40$1), [[vModelText, form.addDirs]])])])
					]),
					createBaseVNode("div", _hoisted_41$1, [_cache[42] || (_cache[42] = createBaseVNode("div", { class: "settings-section-title" }, "Session Launch", -1)), createBaseVNode("div", _hoisted_42$1, [createBaseVNode("div", _hoisted_43$1, [createBaseVNode("div", _hoisted_44$1, [_cache[40] || (_cache[40] = createBaseVNode("span", { class: "settings-label" }, "Pre-launch Command", -1)), isProject.value ? (openBlock(), createElementBlock("label", _hoisted_45$1, [createBaseVNode("input", {
						type: "checkbox",
						checked: useGlobal.preLaunchCmd,
						onChange: _cache[10] || (_cache[10] = ($event) => toggleGlobal("preLaunchCmd", $event.target.checked))
					}, null, 40, _hoisted_46$1), _cache[39] || (_cache[39] = createTextVNode(" Use global default ", -1))])) : createCommentVNode("", true)]), _cache[41] || (_cache[41] = createBaseVNode("div", { class: "settings-description" }, "Prepended to the claude command (e.g. \"aws-vault exec profile --\")", -1))]), createBaseVNode("div", _hoisted_47$1, [withDirectives(createBaseVNode("input", {
						type: "text",
						class: "settings-input",
						"onUpdate:modelValue": _cache[11] || (_cache[11] = ($event) => form.preLaunchCmd = $event),
						placeholder: "e.g. aws-vault exec profile --",
						disabled: isProject.value && useGlobal.preLaunchCmd
					}, null, 8, _hoisted_48$1), [[vModelText, form.preLaunchCmd]])])])]),
					!isProject.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
						createBaseVNode("div", _hoisted_49$1, [
							_cache[52] || (_cache[52] = createBaseVNode("div", { class: "settings-section-title" }, "Application", -1)),
							createBaseVNode("div", _hoisted_50$1, [_cache[43] || (_cache[43] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Terminal Theme"), createBaseVNode("div", { class: "settings-description" }, "Color theme for terminal sessions")], -1)), createBaseVNode("div", _hoisted_51$1, [withDirectives(createBaseVNode("select", {
								class: "settings-select",
								"onUpdate:modelValue": _cache[12] || (_cache[12] = ($event) => form.terminalTheme = $event)
							}, [(openBlock(true), createElementBlock(Fragment, null, renderList(terminalThemes.value, (theme, key) => {
								return openBlock(), createElementBlock("option", {
									key,
									value: key
								}, toDisplayString(theme.label), 9, _hoisted_52$1);
							}), 128))], 512), [[vModelSelect, form.terminalTheme]])])]),
							createBaseVNode("div", _hoisted_53$1, [_cache[44] || (_cache[44] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Terminal Font"), createBaseVNode("div", { class: "settings-description" }, "Monospace font for terminal sessions")], -1)), createBaseVNode("div", _hoisted_54$1, [withDirectives(createBaseVNode("select", {
								class: "settings-select",
								"onUpdate:modelValue": _cache[13] || (_cache[13] = ($event) => form.monoFont = $event)
							}, [(openBlock(true), createElementBlock(Fragment, null, renderList(terminalFonts.value, (font, key) => {
								return openBlock(), createElementBlock("option", {
									key,
									value: key
								}, toDisplayString(font.label), 9, _hoisted_55$1);
							}), 128))], 512), [[vModelSelect, form.monoFont]]), createBaseVNode("span", {
								class: "settings-font-preview",
								style: normalizeStyle({ fontFamily: terminalFonts.value[form.monoFont]?.family })
							}, " fn main() { println!(\"Hello, 世界\"); } ", 4)])]),
							createBaseVNode("div", _hoisted_56$1, [_cache[45] || (_cache[45] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "App Font"), createBaseVNode("div", { class: "settings-description" }, "Font for the application interface (sidebar, labels, viewer)")], -1)), createBaseVNode("div", _hoisted_57$1, [withDirectives(createBaseVNode("select", {
								class: "settings-select",
								"onUpdate:modelValue": _cache[14] || (_cache[14] = ($event) => form.uiFont = $event)
							}, [(openBlock(true), createElementBlock(Fragment, null, renderList(terminalFonts.value, (font, key) => {
								return openBlock(), createElementBlock("option", {
									key,
									value: key
								}, toDisplayString(font.label), 9, _hoisted_58$1);
							}), 128))], 512), [[vModelSelect, form.uiFont]]), createBaseVNode("span", {
								class: "settings-font-preview",
								style: normalizeStyle({ fontFamily: terminalFonts.value[form.uiFont]?.family })
							}, " Switchboard — 42 sessions ", 4)])]),
							createBaseVNode("div", _hoisted_59$1, [_cache[47] || (_cache[47] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Shell Profile"), createBaseVNode("div", { class: "settings-description" }, "Shell used for terminal and Claude sessions. Changes take effect for new sessions only.")], -1)), createBaseVNode("div", _hoisted_60$1, [withDirectives(createBaseVNode("select", {
								class: "settings-select",
								"onUpdate:modelValue": _cache[15] || (_cache[15] = ($event) => form.shellProfile = $event)
							}, [_cache[46] || (_cache[46] = createBaseVNode("option", { value: "auto" }, "Auto (detect)", -1)), (openBlock(true), createElementBlock(Fragment, null, renderList(shellProfiles.value, (p) => {
								return openBlock(), createElementBlock("option", {
									key: p.id,
									value: p.id
								}, toDisplayString(p.name), 9, _hoisted_61$1);
							}), 128))], 512), [[vModelSelect, form.shellProfile]])])]),
							createBaseVNode("div", _hoisted_62$1, [_cache[48] || (_cache[48] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Max Visible Sessions"), createBaseVNode("div", { class: "settings-description" }, "Show up to this many sessions before collapsing the rest behind \"+N older\"")], -1)), createBaseVNode("div", _hoisted_63$1, [withDirectives(createBaseVNode("input", {
								type: "number",
								class: "settings-input settings-input-compact",
								"onUpdate:modelValue": _cache[16] || (_cache[16] = ($event) => form.visibleSessionCount = $event),
								min: "1",
								max: "100"
							}, null, 512), [[
								vModelText,
								form.visibleSessionCount,
								void 0,
								{ number: true }
							]])])]),
							createBaseVNode("div", _hoisted_64$1, [_cache[49] || (_cache[49] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Session Max Age (days)"), createBaseVNode("div", { class: "settings-description" }, "Sessions older than this are hidden behind \"+N older\" even if under the count limit")], -1)), createBaseVNode("div", _hoisted_65$1, [withDirectives(createBaseVNode("input", {
								type: "number",
								class: "settings-input settings-input-compact",
								"onUpdate:modelValue": _cache[17] || (_cache[17] = ($event) => form.sessionMaxAgeDays = $event),
								min: "1",
								max: "365"
							}, null, 512), [[
								vModelText,
								form.sessionMaxAgeDays,
								void 0,
								{ number: true }
							]])])]),
							createBaseVNode("div", _hoisted_66$1, [_cache[50] || (_cache[50] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "IDE Emulation"), createBaseVNode("div", { class: "settings-description" }, "Emulate an IDE so Claude can open files and diffs in a side panel. Disable to use your own IDE instead. Changes take effect for new sessions only.")], -1)), createBaseVNode("div", _hoisted_67$1, [createVNode(_sfc_main$5, {
								modelValue: form.mcpEmulation,
								"onUpdate:modelValue": _cache[18] || (_cache[18] = ($event) => form.mcpEmulation = $event)
							}, null, 8, ["modelValue"])])]),
							createBaseVNode("div", _hoisted_68$1, [_cache[51] || (_cache[51] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Show Avatars"), createBaseVNode("div", { class: "settings-description" }, "Show project initials avatars on session groups and grid cards")], -1)), createBaseVNode("div", _hoisted_69$1, [createVNode(_sfc_main$5, {
								modelValue: form.showAvatars,
								"onUpdate:modelValue": _cache[19] || (_cache[19] = ($event) => form.showAvatars = $event)
							}, null, 8, ["modelValue"])])])
						]),
						createBaseVNode("div", _hoisted_70$1, [_cache[54] || (_cache[54] = createBaseVNode("div", { class: "settings-section-title" }, "Git", -1)), createBaseVNode("div", _hoisted_71$1, [_cache[53] || (_cache[53] = createBaseVNode("div", { class: "settings-field-info" }, [createBaseVNode("span", { class: "settings-label" }, "Commit Message Prompt"), createBaseVNode("div", { class: "settings-description" }, "Instruction sent to Claude CLI when generating a commit message. The git diff is appended automatically. Leave empty to use the default.")], -1)), createBaseVNode("div", _hoisted_72$1, [withDirectives(createBaseVNode("textarea", {
							class: "settings-textarea",
							"onUpdate:modelValue": _cache[20] || (_cache[20] = ($event) => form.commitMessagePrompt = $event),
							placeholder: "Enter prompt…",
							rows: "5"
						}, null, 512), [[vModelText, form.commitMessagePrompt]]), form.commitMessagePrompt ? (openBlock(), createElementBlock("button", {
							key: 0,
							class: "settings-reset-btn",
							onClick: _cache[21] || (_cache[21] = ($event) => form.commitMessagePrompt = "")
						}, "Reset to default")) : createCommentVNode("", true)])])]),
						createBaseVNode("div", _hoisted_73$1, [_cache[57] || (_cache[57] = createBaseVNode("div", { class: "settings-section-title" }, "Updates", -1)), createBaseVNode("div", _hoisted_74$1, [createBaseVNode("div", _hoisted_75$1, [_cache[55] || (_cache[55] = createBaseVNode("span", { class: "settings-label" }, "Version", -1)), createBaseVNode("div", _hoisted_76$1, [appVersion.value ? (openBlock(), createElementBlock("span", _hoisted_77$1, "v" + toDisplayString(appVersion.value), 1)) : createCommentVNode("", true), updateStatus.value ? (openBlock(), createElementBlock("span", _hoisted_78$1, " — " + toDisplayString(updateStatus.value), 1)) : createCommentVNode("", true)])]), createBaseVNode("div", _hoisted_79$1, [createVNode(_sfc_main$4, {
							variant: "secondary",
							size: "sm",
							onClick: checkUpdates
						}, {
							default: withCtx(() => [..._cache[56] || (_cache[56] = [createTextVNode("Check for Updates", -1)])]),
							_: 1
						})])])])
					], 64)) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_80$1, [
						createVNode(_sfc_main$4, {
							variant: "secondary",
							size: "sm",
							onClick: close
						}, {
							default: withCtx(() => [..._cache[58] || (_cache[58] = [createTextVNode("Cancel", -1)])]),
							_: 1
						}),
						createVNode(_sfc_main$4, {
							variant: saveState.value === "saved" ? "success" : "primary",
							size: "sm",
							onClick: save,
							disabled: saveState.value === "saved"
						}, {
							default: withCtx(() => [createTextVNode(toDisplayString(saveState.value === "saved" ? "✓ Saved" : "Save Settings"), 1)]),
							_: 1
						}, 8, ["variant", "disabled"]),
						isProject.value ? (openBlock(), createBlock(_sfc_main$4, {
							key: 0,
							variant: "danger",
							size: "sm",
							onClick: removeProject
						}, {
							default: withCtx(() => [..._cache[59] || (_cache[59] = [createTextVNode("Hide Project", -1)])]),
							_: 1
						})) : createCommentVNode("", true),
						ideNotice.value ? (openBlock(), createElementBlock("span", _hoisted_81$1, toDisplayString(ideNotice.value), 1)) : createCommentVNode("", true)
					])
				]))])]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/FileTreeNode.vue
	var _hoisted_1$2 = { class: "pv-tree-node" };
	var _hoisted_2$2 = ["title"];
	var _hoisted_3$2 = {
		key: 0,
		class: "pv-tree-chevron"
	};
	var _hoisted_4$2 = {
		key: 0,
		width: "10",
		height: "10",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "2.5",
		"stroke-linecap": "round",
		"stroke-linejoin": "round"
	};
	var _hoisted_5$2 = {
		key: 1,
		width: "10",
		height: "10",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "2.5",
		"stroke-linecap": "round",
		"stroke-linejoin": "round"
	};
	var _hoisted_6$2 = {
		key: 1,
		class: "pv-tree-chevron pv-tree-file-icon"
	};
	var _hoisted_7$2 = { key: 0 };
	var _sfc_main$2 = {
		__name: "FileTreeNode",
		props: {
			node: {
				type: Object,
				required: true
			},
			depth: {
				type: Number,
				default: 0
			},
			search: {
				type: String,
				default: ""
			}
		},
		emits: ["open"],
		setup(__props, { emit: __emit }) {
			const props = __props;
			const emit = __emit;
			const expanded = /* @__PURE__ */ ref(props.node._expanded ?? false);
			function toggle() {
				if (props.node.isDir) expanded.value = !expanded.value;
				else emit("open", props.node.path);
			}
			return (_ctx, _cache) => {
				const _component_FileTreeNode = resolveComponent("FileTreeNode", true);
				return openBlock(), createElementBlock("div", _hoisted_1$2, [createBaseVNode("div", {
					class: "pv-tree-row",
					style: normalizeStyle({ paddingLeft: `${__props.depth * 14 + 4}px` }),
					onClick: toggle,
					title: __props.node.path
				}, [__props.node.isDir ? (openBlock(), createElementBlock("span", _hoisted_3$2, [expanded.value ? (openBlock(), createElementBlock("svg", _hoisted_4$2, [..._cache[1] || (_cache[1] = [createBaseVNode("polyline", { points: "6 9 12 15 18 9" }, null, -1)])])) : (openBlock(), createElementBlock("svg", _hoisted_5$2, [..._cache[2] || (_cache[2] = [createBaseVNode("polyline", { points: "9 18 15 12 9 6" }, null, -1)])]))])) : (openBlock(), createElementBlock("span", _hoisted_6$2, [..._cache[3] || (_cache[3] = [createBaseVNode("svg", {
					width: "10",
					height: "10",
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					"stroke-width": "2",
					"stroke-linecap": "round",
					"stroke-linejoin": "round"
				}, [createBaseVNode("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), createBaseVNode("polyline", { points: "14 2 14 8 20 8" })], -1)])])), createBaseVNode("span", { class: normalizeClass(["pv-tree-name", { dir: __props.node.isDir }]) }, toDisplayString(__props.node.name), 3)], 12, _hoisted_2$2), __props.node.isDir && expanded.value ? (openBlock(), createElementBlock("div", _hoisted_7$2, [(openBlock(true), createElementBlock(Fragment, null, renderList(__props.node.children, (child) => {
					return openBlock(), createBlock(_component_FileTreeNode, {
						key: child.path,
						node: child,
						depth: __props.depth + 1,
						search: __props.search,
						onOpen: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("open", $event))
					}, null, 8, [
						"node",
						"depth",
						"search"
					]);
				}), 128))])) : createCommentVNode("", true)]);
			};
		}
	};
	//#endregion
	//#region src/vue/components/ProjectViewerApp.vue
	var _hoisted_1$1 = {
		key: 0,
		class: "pv-root"
	};
	var _hoisted_2$1 = { class: "pv-diff-nav" };
	var _hoisted_3$1 = { class: "pv-nav-file" };
	var _hoisted_4$1 = { class: "pv-nav-filename" };
	var _hoisted_5$1 = { class: "pv-nav-filepath" };
	var _hoisted_6$1 = {
		key: 0,
		class: "pv-nav-arrows"
	};
	var _hoisted_7$1 = ["disabled"];
	var _hoisted_8$1 = { class: "pv-nav-counter" };
	var _hoisted_9$1 = ["disabled"];
	var _hoisted_10$1 = ["disabled"];
	var _hoisted_11$1 = { class: "pv-header" };
	var _hoisted_12$1 = { class: "pv-title-wrap" };
	var _hoisted_13$1 = { class: "pv-name" };
	var _hoisted_14$1 = ["title"];
	var _hoisted_15$1 = { class: "pv-path" };
	var _hoisted_16$1 = {
		key: 0,
		class: "pv-worktree-bar"
	};
	var _hoisted_17$1 = ["onClick"];
	var _hoisted_18 = { class: "pv-tabs" };
	var _hoisted_19 = ["onClick"];
	var _hoisted_20 = { class: "pv-tab-body" };
	var _hoisted_21 = {
		key: 0,
		class: "pv-loading"
	};
	var _hoisted_22 = { class: "pv-git-toolbar" };
	var _hoisted_23 = { class: "pv-branch-wrap" };
	var _hoisted_24 = ["value", "disabled"];
	var _hoisted_25 = { label: "Local" };
	var _hoisted_26 = ["value"];
	var _hoisted_27 = {
		key: 0,
		label: "Remote"
	};
	var _hoisted_28 = ["value"];
	var _hoisted_29 = ["disabled"];
	var _hoisted_30 = ["disabled"];
	var _hoisted_31 = {
		key: 1,
		class: "pv-git-stats"
	};
	var _hoisted_32 = {
		key: 0,
		class: "pv-added"
	};
	var _hoisted_33 = {
		key: 1,
		class: "pv-deleted"
	};
	var _hoisted_34 = { class: "pv-overview-grid" };
	var _hoisted_35 = { class: "pv-col-left" };
	var _hoisted_36 = {
		key: 0,
		class: "pv-card"
	};
	var _hoisted_37 = { class: "pv-card-title" };
	var _hoisted_38 = { class: "pv-count-badge" };
	var _hoisted_39 = { class: "pv-file-list" };
	var _hoisted_40 = ["onClick", "title"];
	var _hoisted_41 = { class: "pv-file-name" };
	var _hoisted_42 = { class: "pv-file-diff" };
	var _hoisted_43 = {
		key: 0,
		class: "pv-added"
	};
	var _hoisted_44 = {
		key: 1,
		class: "pv-deleted"
	};
	var _hoisted_45 = {
		key: 1,
		class: "pv-card pv-empty-changes"
	};
	var _hoisted_46 = {
		width: "20",
		height: "20",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.5",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		style: { "opacity": ".3" }
	};
	var _hoisted_47 = { class: "pv-card pv-commit-card" };
	var _hoisted_48 = {
		key: 0,
		class: "pv-generating-wrap"
	};
	var _hoisted_49 = { class: "pv-commit-actions" };
	var _hoisted_50 = ["disabled"];
	var _hoisted_51 = { class: "pv-commit-btns" };
	var _hoisted_52 = ["disabled"];
	var _hoisted_53 = ["disabled"];
	var _hoisted_54 = { class: "pv-col-right" };
	var _hoisted_55 = {
		key: 0,
		class: "pv-card"
	};
	var _hoisted_56 = { class: "pv-container-list" };
	var _hoisted_57 = { class: "pv-container-name" };
	var _hoisted_58 = { class: "pv-container-state" };
	var _hoisted_59 = {
		key: 0,
		class: "pv-container-ports"
	};
	var _hoisted_60 = {
		key: 1,
		class: "pv-card"
	};
	var _hoisted_61 = { class: "pv-session-list" };
	var _hoisted_62 = ["onClick"];
	var _hoisted_63 = { class: "pv-session-name" };
	var _hoisted_64 = { class: "pv-session-date" };
	var _hoisted_65 = { class: "pv-commits-section-label pv-commits-section-label--unpushed" };
	var _hoisted_66 = { class: "pv-commit-list-full pv-commit-list-full--unpushed" };
	var _hoisted_67 = { class: "pv-commit-hash" };
	var _hoisted_68 = { class: "pv-commit-msg" };
	var _hoisted_69 = { class: "pv-commit-author" };
	var _hoisted_70 = { class: "pv-commit-date" };
	var _hoisted_71 = {
		key: 1,
		class: "pv-commits-section-label"
	};
	var _hoisted_72 = { class: "pv-commit-list-full" };
	var _hoisted_73 = { class: "pv-commit-hash" };
	var _hoisted_74 = { class: "pv-commit-msg" };
	var _hoisted_75 = { class: "pv-commit-author" };
	var _hoisted_76 = { class: "pv-commit-date" };
	var _hoisted_77 = {
		key: 0,
		class: "pv-empty"
	};
	var _hoisted_78 = {
		key: 3,
		class: "pv-files-layout"
	};
	var _hoisted_79 = { class: "pv-tree-panel" };
	var _hoisted_80 = { class: "pv-tree-search" };
	var _hoisted_81 = { class: "pv-tree-scroll" };
	var _hoisted_82 = {
		key: 0,
		class: "pv-loading"
	};
	var _hoisted_83 = {
		key: 0,
		class: "pv-active-sessions"
	};
	var _hoisted_84 = ["onClick"];
	var _hoisted_85 = { class: "pv-asession-name" };
	var _hoisted_86 = ["onClick"];
	var _hoisted_87 = { class: "pv-asession-name" };
	var _hoisted_88 = { class: "pv-session-date" };
	var _hoisted_89 = {
		key: 2,
		class: "pv-empty"
	};
	var _hoisted_90 = { class: "pv-dialog" };
	var _hoisted_91 = { class: "pv-dialog-actions" };
	var _sfc_main$1 = {
		__name: "ProjectViewerApp",
		props: { callbacks: {
			type: Object,
			required: true
		} },
		setup(__props, { expose: __expose }) {
			const TABS = computed(() => [
				{
					id: "overview",
					label: "Overview"
				},
				{
					id: "commits",
					label: unpushedCount.value ? `Commits (${unpushedCount.value})` : "Commits"
				},
				{
					id: "files",
					label: "Files"
				},
				{
					id: "sessions",
					label: activeSessions.value.length ? `Sessions (${activeSessions.value.length})` : "Sessions"
				}
			]);
			const props = __props;
			const project = /* @__PURE__ */ ref(null);
			const worktrees = /* @__PURE__ */ ref([]);
			const viewedPath = /* @__PURE__ */ ref("");
			const detail = /* @__PURE__ */ ref(null);
			const loading = /* @__PURE__ */ ref(false);
			const activeTab = /* @__PURE__ */ ref("overview");
			watch(activeTab, (tab) => props.callbacks.onTabChange?.(tab));
			const branches = /* @__PURE__ */ ref([]);
			const remoteBranches = /* @__PURE__ */ ref([]);
			const gitBusy = /* @__PURE__ */ ref(false);
			const gitMessage = /* @__PURE__ */ ref("");
			const gitError = /* @__PURE__ */ ref(false);
			const commitMessage = /* @__PURE__ */ ref("");
			const generating = /* @__PURE__ */ ref(false);
			const confirmPush = /* @__PURE__ */ ref(false);
			const loadingFile = /* @__PURE__ */ ref(null);
			const activeDiff = /* @__PURE__ */ ref(null);
			const activeFile = /* @__PURE__ */ ref(null);
			const fileContent = /* @__PURE__ */ ref("");
			const fileModified = /* @__PURE__ */ ref(false);
			const fileSaving = /* @__PURE__ */ ref(false);
			const diffContainerRef = /* @__PURE__ */ ref(null);
			let editorView = null;
			const fileTree = /* @__PURE__ */ ref([]);
			const treeLoading = /* @__PURE__ */ ref(false);
			const treeSearch = /* @__PURE__ */ ref("");
			const sessions = /* @__PURE__ */ ref([]);
			const activeSessions = /* @__PURE__ */ ref([]);
			const avatar = computed(() => project.value && window.getProjectAvatar ? window.getProjectAvatar(project.value.projectPath) : {
				initials: "?",
				color: "#666"
			});
			const projectName = computed(() => project.value?.projectPath.split("/").filter(Boolean).pop() || "");
			const changedFiles = computed(() => detail.value?.changedFiles || []);
			const unpushedCommits = computed(() => detail.value?.unpushedCommits || []);
			const unpushedCount = computed(() => unpushedCommits.value.length);
			const currentFileIndex = computed(() => changedFiles.value.findIndex((f) => f.file === activeDiff.value?.filePath));
			const overlayTitle = computed(() => {
				if (activeDiff.value) return basename(activeDiff.value.filePath);
				if (activeFile.value) return basename(activeFile.value);
				return "";
			});
			const overlayPath = computed(() => activeDiff.value?.filePath || activeFile.value || "");
			const filteredTree = computed(() => {
				if (!treeSearch.value) return fileTree.value;
				return filterTree(fileTree.value, treeSearch.value.toLowerCase());
			});
			function basename(p) {
				return p ? p.replace(/\\/g, "/").split("/").pop() || p : "";
			}
			function fmtDate(t) {
				if (!t) return "";
				try {
					return window.formatDate ? window.formatDate(new Date(t)) : new Date(t).toLocaleDateString();
				} catch {
					return "";
				}
			}
			function fileStatus(f) {
				if (!f.added && f.deleted) return "deleted";
				if (f.added && !f.deleted) return "added";
				return "modified";
			}
			function fileStatusChar(f) {
				if (!f.added && f.deleted) return "D";
				if (f.added && !f.deleted) return "A";
				return "M";
			}
			function filterTree(nodes, q) {
				const result = [];
				for (const n of nodes) if (n.isDir) {
					const children = filterTree(n.children || [], q);
					if (children.length) result.push({
						...n,
						children,
						_expanded: true
					});
				} else if (n.name.toLowerCase().includes(q)) result.push(n);
				return result;
			}
			watch(viewedPath, async (p) => {
				if (!p) return;
				activeDiff.value = null;
				activeFile.value = null;
				commitMessage.value = "";
				const cached = await window.api.getProjectGitCache(p).catch(() => null);
				if (cached) {
					detail.value = cached;
					loading.value = false;
				} else {
					detail.value = null;
					loading.value = true;
				}
				const rootPath = project.value?.projectPath;
				const [det, br, sess, terminals] = await Promise.all([
					window.api.getProjectDetail(p).catch(() => null),
					window.api.gitBranches(p).catch(() => null),
					window.api.getProjectSessions(rootPath || p).catch(() => null),
					window.api.getActiveTerminals().catch(() => null)
				]);
				detail.value = det || detail.value;
				branches.value = br?.ok ? br.branches : [];
				remoteBranches.value = br?.ok ? br.remotes || [] : [];
				if (sess?.ok) sessions.value = sess.sessions;
				if (terminals) activeSessions.value = Object.values(terminals).filter((t) => t.projectPath === (rootPath || p) && !t.exited).map((t) => ({
					id: t.id,
					name: t.title || t.id?.slice(0, 12),
					busy: t.busy || false
				}));
				loading.value = false;
			});
			watch(activeTab, async (tab) => {
				if (tab === "files" && !fileTree.value.length && viewedPath.value) {
					treeLoading.value = true;
					const res = await window.api.getFileTree(viewedPath.value).catch(() => null);
					if (res?.ok) fileTree.value = res.tree;
					treeLoading.value = false;
				}
			});
			watch([activeDiff, activeFile], async ([diff, file]) => {
				if (editorView) {
					try {
						typeof editorView.destroy === "function" ? editorView.destroy() : editorView.a?.destroy();
					} catch {}
					editorView = null;
				}
				if (!diff && !file) return;
				await nextTick();
				const el = diffContainerRef.value;
				if (!el) return;
				el.innerHTML = "";
				if (diff) editorView = window.createReadOnlyMergeViewer?.(el, diff.oldContent, diff.newContent, diff.filePath);
				else if (file) {
					editorView = window.createEditableViewer?.(el, fileContent.value, file);
					if (editorView) editorView.dom?.addEventListener("input", () => {
						fileModified.value = true;
					});
				}
			});
			async function openDiff(filePath) {
				if (loadingFile.value) return;
				loadingFile.value = filePath;
				try {
					const result = await window.api.getFileDiff(viewedPath.value, filePath);
					if (!result?.ok) return;
					activeFile.value = null;
					activeDiff.value = {
						filePath,
						oldContent: result.oldContent,
						newContent: result.newContent
					};
				} finally {
					loadingFile.value = null;
				}
			}
			async function openFileFromTree(path) {
				const fullPath = `${viewedPath.value}/${path}`;
				const res = await window.api.readFileForPanel(fullPath).catch(() => null);
				if (!res?.ok) return;
				fileContent.value = res.content;
				fileModified.value = false;
				activeDiff.value = null;
				activeFile.value = fullPath;
			}
			async function saveFile() {
				if (!activeFile.value || !editorView) return;
				fileSaving.value = true;
				const content = editorView.state?.doc?.toString?.() ?? fileContent.value;
				await window.api.saveFileForPanel(activeFile.value, content).catch(() => {});
				fileModified.value = false;
				fileSaving.value = false;
			}
			function closeOverlay() {
				activeDiff.value = null;
				activeFile.value = null;
			}
			function prevFile() {
				const i = currentFileIndex.value;
				if (i > 0) openDiff(changedFiles.value[i - 1].file);
			}
			function nextFile() {
				const i = currentFileIndex.value;
				if (i < changedFiles.value.length - 1) openDiff(changedFiles.value[i + 1].file);
			}
			function showGitMsg(msg, isError = false, ms = 4e3) {
				gitMessage.value = msg;
				gitError.value = isError;
				setTimeout(() => {
					gitMessage.value = "";
					gitError.value = false;
				}, ms);
			}
			async function switchBranch(branch) {
				if (branch === detail.value?.branch) return;
				gitBusy.value = true;
				const res = await window.api.gitCheckout(viewedPath.value, branch);
				gitBusy.value = false;
				if (res.ok) {
					showGitMsg(`Switched to ${branch}`);
					await reload();
				} else showGitMsg(res.error || "Checkout failed", true);
			}
			async function doFetch() {
				gitBusy.value = true;
				showGitMsg("Fetching…");
				const res = await window.api.gitFetch(viewedPath.value);
				gitBusy.value = false;
				if (res.ok) {
					showGitMsg("Fetched");
					const br = await window.api.gitBranches(viewedPath.value);
					if (br?.ok) {
						branches.value = br.branches;
						remoteBranches.value = br.remotes || [];
					}
				} else showGitMsg(res.error || "Fetch failed", true);
			}
			async function doPull() {
				gitBusy.value = true;
				showGitMsg("Pulling…");
				const res = await window.api.gitPull(viewedPath.value);
				gitBusy.value = false;
				if (res.ok) {
					showGitMsg("Pulled");
					await reload();
				} else showGitMsg(res.error || "Pull failed", true);
			}
			async function generateCommitMsg() {
				generating.value = true;
				gitBusy.value = true;
				const res = await window.api.gitGenerateCommitMsg(viewedPath.value);
				generating.value = false;
				gitBusy.value = false;
				if (res.ok) commitMessage.value = res.message;
				else showGitMsg(res.error || "Generation failed", true);
			}
			async function doCommit() {
				if (!commitMessage.value.trim()) return;
				gitBusy.value = true;
				const res = await window.api.gitCommit(viewedPath.value, commitMessage.value.trim());
				gitBusy.value = false;
				if (res.ok) {
					showGitMsg("Committed");
					commitMessage.value = "";
					await reload();
				} else showGitMsg(res.error || "Commit failed", true);
			}
			async function doPush() {
				confirmPush.value = false;
				gitBusy.value = true;
				showGitMsg("Pushing…");
				const res = await window.api.gitPush(viewedPath.value);
				gitBusy.value = false;
				if (res.ok) showGitMsg("Pushed successfully");
				else showGitMsg(res.error || "Push failed", true);
			}
			async function reload() {
				const p = viewedPath.value;
				if (!p) return;
				const det = await window.api.getProjectDetail(p).catch(() => null);
				detail.value = det;
			}
			function setViewedPath(path) {
				if (path === viewedPath.value) return;
				fileTree.value = [];
				viewedPath.value = path;
			}
			function openSession(s) {
				window.__sb?.openSessionById?.(s.id);
			}
			function newSession() {
				if (project.value) props.callbacks.newSession?.(project.value);
			}
			__expose({
				open(proj, wts = []) {
					project.value = proj;
					worktrees.value = wts;
					viewedPath.value = proj?.projectPath || "";
				},
				close() {
					project.value = null;
					worktrees.value = [];
					viewedPath.value = "";
					detail.value = null;
					activeDiff.value = null;
					activeFile.value = null;
				},
				setTab(tab) {
					activeTab.value = tab;
				},
				setViewedPath
			});
			return (_ctx, _cache) => {
				return project.value ? (openBlock(), createElementBlock("div", _hoisted_1$1, [activeDiff.value || activeFile.value ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createBaseVNode("div", _hoisted_2$1, [
					createBaseVNode("button", {
						class: "pv-nav-btn pv-nav-back",
						onClick: closeOverlay
					}, [..._cache[7] || (_cache[7] = [createBaseVNode("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "2.5",
						"stroke-linecap": "round",
						"stroke-linejoin": "round"
					}, [createBaseVNode("polyline", { points: "15 18 9 12 15 6" })], -1), createTextVNode(" Back ", -1)])]),
					createBaseVNode("span", _hoisted_3$1, [createBaseVNode("span", _hoisted_4$1, toDisplayString(overlayTitle.value), 1), createBaseVNode("span", _hoisted_5$1, toDisplayString(overlayPath.value), 1)]),
					activeDiff.value ? (openBlock(), createElementBlock("div", _hoisted_6$1, [
						createBaseVNode("button", {
							class: "pv-nav-btn",
							onClick: prevFile,
							disabled: currentFileIndex.value <= 0,
							title: "Previous file"
						}, [..._cache[8] || (_cache[8] = [createBaseVNode("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2.5",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [createBaseVNode("polyline", { points: "15 18 9 12 15 6" })], -1)])], 8, _hoisted_7$1),
						createBaseVNode("span", _hoisted_8$1, toDisplayString(currentFileIndex.value + 1) + " / " + toDisplayString(changedFiles.value.length), 1),
						createBaseVNode("button", {
							class: "pv-nav-btn",
							onClick: nextFile,
							disabled: currentFileIndex.value >= changedFiles.value.length - 1,
							title: "Next file"
						}, [..._cache[9] || (_cache[9] = [createBaseVNode("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2.5",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [createBaseVNode("polyline", { points: "9 18 15 12 9 6" })], -1)])], 8, _hoisted_9$1)
					])) : createCommentVNode("", true),
					activeFile.value ? (openBlock(), createElementBlock("button", {
						key: 1,
						class: "pv-nav-btn pv-save-btn",
						onClick: saveFile,
						disabled: !fileModified.value || fileSaving.value
					}, toDisplayString(fileSaving.value ? "Saving…" : "Save"), 9, _hoisted_10$1)) : createCommentVNode("", true)
				]), createBaseVNode("div", {
					ref_key: "diffContainerRef",
					ref: diffContainerRef,
					class: "pv-diff-container"
				}, null, 512)], 64)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
					createBaseVNode("div", _hoisted_11$1, [
						createBaseVNode("span", {
							class: "pv-avatar",
							style: normalizeStyle({ background: avatar.value.color })
						}, toDisplayString(avatar.value.initials), 5),
						createBaseVNode("div", _hoisted_12$1, [createBaseVNode("div", _hoisted_13$1, [createTextVNode(toDisplayString(projectName.value) + " ", 1), unpushedCount.value ? (openBlock(), createElementBlock("span", {
							key: 0,
							class: "pv-header-unpushed-badge",
							title: `${unpushedCount.value} unpushed commit${unpushedCount.value > 1 ? "s" : ""}`
						}, toDisplayString(unpushedCount.value), 9, _hoisted_14$1)) : createCommentVNode("", true)]), createBaseVNode("div", _hoisted_15$1, toDisplayString(viewedPath.value), 1)]),
						createBaseVNode("button", {
							class: "pv-new-btn",
							onClick: newSession
						}, "+ New session")
					]),
					worktrees.value.length ? (openBlock(), createElementBlock("div", _hoisted_16$1, [createBaseVNode("button", {
						class: normalizeClass(["pv-wt-btn", { active: viewedPath.value === project.value.projectPath }]),
						onClick: _cache[0] || (_cache[0] = ($event) => setViewedPath(project.value.projectPath))
					}, "main", 2), (openBlock(true), createElementBlock(Fragment, null, renderList(worktrees.value, (wt) => {
						return openBlock(), createElementBlock("button", {
							key: wt.projectPath,
							class: normalizeClass(["pv-wt-btn", { active: viewedPath.value === wt.projectPath }]),
							onClick: ($event) => setViewedPath(wt.projectPath)
						}, toDisplayString(wt.name), 11, _hoisted_17$1);
					}), 128))])) : createCommentVNode("", true),
					createBaseVNode("div", _hoisted_18, [(openBlock(true), createElementBlock(Fragment, null, renderList(TABS.value, (t) => {
						return openBlock(), createElementBlock("button", {
							key: t.id,
							class: normalizeClass(["pv-tab", { active: activeTab.value === t.id }]),
							onClick: ($event) => activeTab.value = t.id
						}, toDisplayString(t.label), 11, _hoisted_19);
					}), 128))]),
					createBaseVNode("div", _hoisted_20, [loading.value ? (openBlock(), createElementBlock("div", _hoisted_21, "Loading…")) : activeTab.value === "overview" && detail.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [createBaseVNode("div", _hoisted_22, [
						createBaseVNode("div", _hoisted_23, [_cache[10] || (_cache[10] = createStaticVNode("<svg class=\"pv-branch-icon\" width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"6\" y1=\"3\" x2=\"6\" y2=\"15\"></line><circle cx=\"18\" cy=\"6\" r=\"3\"></circle><circle cx=\"6\" cy=\"18\" r=\"3\"></circle><path d=\"M18 9a9 9 0 0 1-9 9\"></path></svg>", 1)), createBaseVNode("select", {
							class: "pv-branch-select",
							value: detail.value.branch,
							onChange: _cache[1] || (_cache[1] = ($event) => switchBranch($event.target.value)),
							disabled: gitBusy.value
						}, [createBaseVNode("optgroup", _hoisted_25, [(openBlock(true), createElementBlock(Fragment, null, renderList(branches.value, (b) => {
							return openBlock(), createElementBlock("option", {
								key: b,
								value: b
							}, toDisplayString(b), 9, _hoisted_26);
						}), 128))]), remoteBranches.value.length ? (openBlock(), createElementBlock("optgroup", _hoisted_27, [(openBlock(true), createElementBlock(Fragment, null, renderList(remoteBranches.value, (b) => {
							return openBlock(), createElementBlock("option", {
								key: b,
								value: b
							}, toDisplayString(b), 9, _hoisted_28);
						}), 128))])) : createCommentVNode("", true)], 40, _hoisted_24)]),
						createBaseVNode("button", {
							class: "pv-git-btn",
							onClick: doFetch,
							disabled: gitBusy.value,
							title: "git fetch --prune"
						}, [..._cache[11] || (_cache[11] = [createBaseVNode("svg", {
							width: "13",
							height: "13",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [createBaseVNode("polyline", { points: "23 4 23 10 17 10" }), createBaseVNode("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })], -1), createTextVNode(" Fetch ", -1)])], 8, _hoisted_29),
						createBaseVNode("button", {
							class: "pv-git-btn",
							onClick: doPull,
							disabled: gitBusy.value,
							title: "git pull"
						}, [..._cache[12] || (_cache[12] = [createBaseVNode("svg", {
							width: "13",
							height: "13",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [createBaseVNode("line", {
							x1: "12",
							y1: "5",
							x2: "12",
							y2: "19"
						}), createBaseVNode("polyline", { points: "19 12 12 19 5 12" })], -1), createTextVNode(" Pull ", -1)])], 8, _hoisted_30),
						gitMessage.value ? (openBlock(), createElementBlock("span", {
							key: 0,
							class: normalizeClass(["pv-git-msg", { error: gitError.value }])
						}, toDisplayString(gitMessage.value), 3)) : createCommentVNode("", true),
						detail.value.totalAdded || detail.value.totalDeleted ? (openBlock(), createElementBlock("span", _hoisted_31, [detail.value.totalAdded ? (openBlock(), createElementBlock("span", _hoisted_32, "+" + toDisplayString(detail.value.totalAdded), 1)) : createCommentVNode("", true), detail.value.totalDeleted ? (openBlock(), createElementBlock("span", _hoisted_33, "−" + toDisplayString(detail.value.totalDeleted), 1)) : createCommentVNode("", true)])) : createCommentVNode("", true)
					]), createBaseVNode("div", _hoisted_34, [createBaseVNode("div", _hoisted_35, [detail.value.changedFiles.length ? (openBlock(), createElementBlock("div", _hoisted_36, [createBaseVNode("div", _hoisted_37, [_cache[13] || (_cache[13] = createBaseVNode("span", null, "Uncommitted changes", -1)), createBaseVNode("span", _hoisted_38, toDisplayString(detail.value.changedFiles.length), 1)]), createBaseVNode("div", _hoisted_39, [(openBlock(true), createElementBlock(Fragment, null, renderList(detail.value.changedFiles, (f) => {
						return openBlock(), createElementBlock("div", {
							key: f.file,
							class: normalizeClass(["pv-file-row pv-file-row--clickable", { loading: loadingFile.value === f.file }]),
							onClick: ($event) => openDiff(f.file),
							title: f.file
						}, [
							createBaseVNode("span", { class: normalizeClass(["pv-file-status", fileStatus(f)]) }, toDisplayString(fileStatusChar(f)), 3),
							createBaseVNode("span", _hoisted_41, toDisplayString(f.file), 1),
							createBaseVNode("span", _hoisted_42, [f.added ? (openBlock(), createElementBlock("span", _hoisted_43, "+" + toDisplayString(f.added), 1)) : createCommentVNode("", true), f.deleted ? (openBlock(), createElementBlock("span", _hoisted_44, "−" + toDisplayString(f.deleted), 1)) : createCommentVNode("", true)])
						], 10, _hoisted_40);
					}), 128))])])) : (openBlock(), createElementBlock("div", _hoisted_45, [(openBlock(), createElementBlock("svg", _hoisted_46, [..._cache[14] || (_cache[14] = [createBaseVNode("polyline", { points: "20 6 9 17 4 12" }, null, -1)])])), _cache[15] || (_cache[15] = createBaseVNode("span", null, "Working tree clean", -1))])), createBaseVNode("div", _hoisted_47, [
						_cache[19] || (_cache[19] = createBaseVNode("div", { class: "pv-card-title" }, "Commit", -1)),
						generating.value ? (openBlock(), createElementBlock("div", _hoisted_48, [..._cache[16] || (_cache[16] = [createBaseVNode("span", { class: "pv-generating-text" }, "Generating…", -1)])])) : withDirectives((openBlock(), createElementBlock("textarea", {
							key: 1,
							class: "pv-commit-input",
							placeholder: "Commit message…",
							"onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => commitMessage.value = $event),
							rows: "3"
						}, null, 512)), [[vModelText, commitMessage.value]]),
						createBaseVNode("div", _hoisted_49, [createBaseVNode("button", {
							class: "pv-git-btn pv-gen-btn",
							onClick: generateCommitMsg,
							disabled: gitBusy.value || generating.value
						}, [..._cache[17] || (_cache[17] = [createBaseVNode("svg", {
							width: "13",
							height: "13",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [
							createBaseVNode("path", { d: "M12 2L2 7l10 5 10-5-10-5z" }),
							createBaseVNode("path", { d: "M2 17l10 5 10-5" }),
							createBaseVNode("path", { d: "M2 12l10 5 10-5" })
						], -1), createTextVNode(" Generate with Claude ", -1)])], 8, _hoisted_50), createBaseVNode("div", _hoisted_51, [createBaseVNode("button", {
							class: "pv-action-btn",
							onClick: doCommit,
							disabled: gitBusy.value || !commitMessage.value.trim()
						}, " Commit ", 8, _hoisted_52), createBaseVNode("button", {
							class: "pv-action-btn pv-push-btn",
							onClick: _cache[3] || (_cache[3] = ($event) => confirmPush.value = true),
							disabled: gitBusy.value,
							title: "Push to remote"
						}, [..._cache[18] || (_cache[18] = [createBaseVNode("svg", {
							width: "13",
							height: "13",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [createBaseVNode("line", {
							x1: "12",
							y1: "19",
							x2: "12",
							y2: "5"
						}), createBaseVNode("polyline", { points: "5 12 12 5 19 12" })], -1), createTextVNode(" Push ", -1)])], 8, _hoisted_53)])])
					])]), createBaseVNode("div", _hoisted_54, [detail.value.containers.length ? (openBlock(), createElementBlock("div", _hoisted_55, [_cache[21] || (_cache[21] = createBaseVNode("div", { class: "pv-card-title" }, "Docker Compose", -1)), createBaseVNode("div", _hoisted_56, [(openBlock(true), createElementBlock(Fragment, null, renderList(detail.value.containers, (c) => {
						return openBlock(), createElementBlock("div", {
							key: c.name,
							class: normalizeClass(["pv-container-row", { running: c.state.includes("running") }])
						}, [
							_cache[20] || (_cache[20] = createBaseVNode("span", { class: "pv-container-dot" }, null, -1)),
							createBaseVNode("span", _hoisted_57, toDisplayString(c.name), 1),
							createBaseVNode("span", _hoisted_58, toDisplayString(c.status || c.state), 1),
							c.ports ? (openBlock(), createElementBlock("span", _hoisted_59, toDisplayString(c.ports), 1)) : createCommentVNode("", true)
						], 2);
					}), 128))])])) : createCommentVNode("", true), sessions.value.length ? (openBlock(), createElementBlock("div", _hoisted_60, [_cache[22] || (_cache[22] = createBaseVNode("div", { class: "pv-card-title" }, "Recent sessions", -1)), createBaseVNode("div", _hoisted_61, [(openBlock(true), createElementBlock(Fragment, null, renderList(sessions.value, (s) => {
						return openBlock(), createElementBlock("div", {
							key: s.id,
							class: "pv-session-row",
							onClick: ($event) => openSession(s)
						}, [createBaseVNode("div", _hoisted_63, toDisplayString(s.name), 1), createBaseVNode("div", _hoisted_64, toDisplayString(fmtDate(s.updatedAt)), 1)], 8, _hoisted_62);
					}), 128))])])) : createCommentVNode("", true)])])], 64)) : activeTab.value === "commits" && detail.value ? (openBlock(), createElementBlock(Fragment, { key: 2 }, [
						unpushedCommits.value.length ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createBaseVNode("div", _hoisted_65, [_cache[23] || (_cache[23] = createBaseVNode("svg", {
							width: "11",
							height: "11",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2.5",
							"stroke-linecap": "round",
							"stroke-linejoin": "round"
						}, [createBaseVNode("line", {
							x1: "12",
							y1: "19",
							x2: "12",
							y2: "5"
						}), createBaseVNode("polyline", { points: "5 12 12 5 19 12" })], -1)), createTextVNode(" " + toDisplayString(unpushedCommits.value.length) + " unpushed ", 1)]), createBaseVNode("div", _hoisted_66, [(openBlock(true), createElementBlock(Fragment, null, renderList(unpushedCommits.value, (c) => {
							return openBlock(), createElementBlock("div", {
								key: c.hash,
								class: "pv-commit-item"
							}, [
								createBaseVNode("span", _hoisted_67, toDisplayString(c.hash), 1),
								createBaseVNode("span", _hoisted_68, toDisplayString(c.message), 1),
								createBaseVNode("span", _hoisted_69, toDisplayString(c.author), 1),
								createBaseVNode("span", _hoisted_70, toDisplayString(c.date), 1)
							]);
						}), 128))])], 64)) : createCommentVNode("", true),
						detail.value.commits.length ? (openBlock(), createElementBlock("div", _hoisted_71, "History")) : createCommentVNode("", true),
						createBaseVNode("div", _hoisted_72, [(openBlock(true), createElementBlock(Fragment, null, renderList(detail.value.commits, (c) => {
							return openBlock(), createElementBlock("div", {
								key: c.hash,
								class: "pv-commit-item"
							}, [
								createBaseVNode("span", _hoisted_73, toDisplayString(c.hash), 1),
								createBaseVNode("span", _hoisted_74, toDisplayString(c.message), 1),
								createBaseVNode("span", _hoisted_75, toDisplayString(c.author), 1),
								createBaseVNode("span", _hoisted_76, toDisplayString(c.date), 1)
							]);
						}), 128)), !detail.value.commits.length ? (openBlock(), createElementBlock("div", _hoisted_77, "No commits found.")) : createCommentVNode("", true)])
					], 64)) : activeTab.value === "files" ? (openBlock(), createElementBlock("div", _hoisted_78, [createBaseVNode("div", _hoisted_79, [createBaseVNode("div", _hoisted_80, [withDirectives(createBaseVNode("input", {
						"onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => treeSearch.value = $event),
						class: "pv-tree-search-input",
						placeholder: "Filter files…"
					}, null, 512), [[vModelText, treeSearch.value]])]), createBaseVNode("div", _hoisted_81, [treeLoading.value ? (openBlock(), createElementBlock("div", _hoisted_82, "Loading…")) : (openBlock(true), createElementBlock(Fragment, { key: 1 }, renderList(filteredTree.value, (node) => {
						return openBlock(), createBlock(_sfc_main$2, {
							key: node.path,
							node,
							search: treeSearch.value,
							onOpen: openFileFromTree
						}, null, 8, ["node", "search"]);
					}), 128))])])])) : activeTab.value === "sessions" ? (openBlock(), createElementBlock(Fragment, { key: 4 }, [
						activeSessions.value.length ? (openBlock(), createElementBlock("div", _hoisted_83, [_cache[24] || (_cache[24] = createBaseVNode("div", {
							class: "pv-commits-section-label",
							style: { "margin-top": "0" }
						}, [createBaseVNode("svg", {
							width: "8",
							height: "8",
							viewBox: "0 0 8 8"
						}, [createBaseVNode("circle", {
							cx: "4",
							cy: "4",
							r: "4",
							fill: "#34d399"
						})]), createTextVNode(" Active ")], -1)), (openBlock(true), createElementBlock(Fragment, null, renderList(activeSessions.value, (s) => {
							return openBlock(), createElementBlock("div", {
								key: s.id,
								class: "pv-asession-row",
								onClick: ($event) => openSession(s)
							}, [createBaseVNode("div", _hoisted_85, toDisplayString(s.name || s.id.slice(0, 12)), 1), createBaseVNode("span", { class: normalizeClass(["pv-asession-badge", s.busy ? "busy" : "idle"]) }, toDisplayString(s.busy ? "working" : "idle"), 3)], 8, _hoisted_84);
						}), 128))])) : createCommentVNode("", true),
						sessions.value.length ? (openBlock(), createElementBlock("div", {
							key: 1,
							class: "pv-active-sessions",
							style: normalizeStyle(activeSessions.value.length ? "margin-top:16px" : "")
						}, [createBaseVNode("div", {
							class: "pv-commits-section-label",
							style: normalizeStyle(activeSessions.value.length ? "" : "margin-top:0")
						}, "Recent", 4), (openBlock(true), createElementBlock(Fragment, null, renderList(sessions.value, (s) => {
							return openBlock(), createElementBlock("div", {
								key: s.id,
								class: "pv-asession-row",
								onClick: ($event) => openSession(s)
							}, [createBaseVNode("div", _hoisted_87, toDisplayString(s.name), 1), createBaseVNode("div", _hoisted_88, toDisplayString(fmtDate(s.updatedAt)), 1)], 8, _hoisted_86);
						}), 128))], 4)) : createCommentVNode("", true),
						!activeSessions.value.length && !sessions.value.length ? (openBlock(), createElementBlock("div", _hoisted_89, "No sessions found.")) : createCommentVNode("", true)
					], 64)) : createCommentVNode("", true)])
				], 64)), confirmPush.value ? (openBlock(), createElementBlock("div", {
					key: 2,
					class: "pv-dialog-overlay",
					onClick: _cache[6] || (_cache[6] = withModifiers(($event) => confirmPush.value = false, ["self"]))
				}, [createBaseVNode("div", _hoisted_90, [
					_cache[25] || (_cache[25] = createBaseVNode("div", { class: "pv-dialog-title" }, "Push to remote?", -1)),
					_cache[26] || (_cache[26] = createBaseVNode("div", { class: "pv-dialog-body" }, "This will push the current branch to origin. Are you sure?", -1)),
					createBaseVNode("div", _hoisted_91, [createBaseVNode("button", {
						class: "pv-dialog-cancel",
						onClick: _cache[5] || (_cache[5] = ($event) => confirmPush.value = false)
					}, "Cancel"), createBaseVNode("button", {
						class: "pv-action-btn pv-push-btn",
						onClick: doPush
					}, "Push")])
				])])) : createCommentVNode("", true)])) : createCommentVNode("", true);
			};
		}
	};
	//#endregion
	//#region src/vue/components/App.vue
	var _hoisted_1 = { id: "account-selector" };
	var _hoisted_2 = { id: "sidebar-header" };
	var _hoisted_3 = { id: "sidebar-tabs" };
	var _hoisted_4 = [
		"data-tab",
		"data-tooltip",
		"onClick",
		"innerHTML"
	];
	var _hoisted_5 = { id: "session-filters" };
	var _hoisted_6 = ["placeholder", "value"];
	var _hoisted_7 = { id: "sidebar-content" };
	var _hoisted_8 = {
		key: 0,
		id: "account-switch-overlay",
		class: "account-switch-preloader"
	};
	var _hoisted_9 = { id: "plans-content" };
	var _hoisted_10 = { id: "stats-content" };
	var _hoisted_11 = { id: "memory-content" };
	var _hoisted_12 = { id: "accounts-content" };
	var _hoisted_13 = { id: "projects-content" };
	var _hoisted_14 = { id: "main" };
	var _hoisted_15 = {
		id: "project-viewer",
		style: { "display": "none" }
	};
	var _hoisted_16 = { id: "terminal-area" };
	var _hoisted_17 = { id: "vue-session-header" };
	var EXPAND_SVG = "<svg stroke=\"currentColor\" fill=\"currentColor\" stroke-width=\"0\" viewBox=\"0 0 24 24\" height=\"20\" width=\"20\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M18 3a3 3 0 0 1 2.995 2.824l.005 .176v12a3 3 0 0 1 -2.824 2.995l-.176 .005h-12a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-12a3 3 0 0 1 2.824 -2.995l.176 -.005h12zm-3 2h-9a1 1 0 0 0 -.993 .883l-.007 .117v12a1 1 0 0 0 .883 .993l.117 .007h9v-14zm-5.387 4.21l.094 .083l2 2a1 1 0 0 1 .083 1.32l-.083 .094l-2 2a1 1 0 0 1 -1.497 -1.32l.083 -.094l1.292 -1.293l-1.292 -1.293a1 1 0 0 1 -.083 -1.32l.083 -.094a1 1 0 0 1 1.32 -.083z\"></path></svg>";
	var COLLAPSE_SVG = "<svg stroke=\"currentColor\" fill=\"currentColor\" stroke-width=\"0\" viewBox=\"0 0 24 24\" height=\"20\" width=\"20\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M18 3a3 3 0 0 1 2.995 2.824l.005 .176v12a3 3 0 0 1 -2.824 2.995l-.176 .005h-12a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-12a3 3 0 0 1 2.824 -2.995l.176 -.005h12zm0 2h-9v14h9a1 1 0 0 0 .993 -.883l.007 -.117v-12a1 1 0 0 0 -.883 -.993l-.117 -.007zm-2.293 4.293a1 1 0 0 1 .083 1.32l-.083 .094l-1.292 1.293l1.292 1.293a1 1 0 0 1 .083 1.32l-.083 .094a1 1 0 0 1 -1.32 .083l-.094 -.083l-2 -2a1 1 0 0 1 -.083 -1.32l.083 -.094l2 -2a1 1 0 0 1 1.414 0z\"></path></svg>";
	var GEAR_SVG = "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0\"><path d=\"M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1.5 0a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z\"></path><path d=\"M12 1c.266 0 .532.009.797.028.763.055 1.345.617 1.512 1.304l.352 1.45c.019.078.09.171.225.221.247.089.49.19.728.302.13.061.246.044.315.002l1.275-.776c.603-.368 1.411-.353 1.99.147.402.349.78.726 1.128 1.129.501.578.515 1.386.147 1.99l-.776 1.274c-.042.069-.058.185.002.315.112.238.213.481.303.728.048.135.142.205.22.225l1.45.352c.687.167 1.249.749 1.303 1.512.038.531.038 1.063 0 1.594-.054.763-.616 1.345-1.303 1.512l-1.45.352c-.078.019-.171.09-.221.225-.089.248-.19.491-.302.728-.061.13-.044.246-.002.315l.776 1.275c.368.603.353 1.411-.147 1.99-.349.402-.726.78-1.129 1.128-.578.501-1.386.515-1.99.147l-1.274-.776c-.069-.042-.185-.058-.314.002a8.606 8.606 0 0 1-.729.303c-.135.048-.205.142-.225.22l-.352 1.45c-.167.687-.749 1.249-1.512 1.303-.531.038-1.063.038-1.594 0-.763-.054-1.345-.616-1.512-1.303l-.352-1.45c-.019-.078-.09-.171-.225-.221a8.138 8.138 0 0 1-.728-.302c-.13-.061-.246-.044-.315-.002l-1.275.776c-.603.368-1.411.353-1.99-.147-.402-.349-.78-.726-1.128-1.129-.501-.578-.515-1.386-.147-1.99l.776-1.274c.042-.069.058-.185-.002-.314a8.606 8.606 0 0 1-.303-.729c-.048-.135-.142-.205-.22-.225l-1.45-.352c-.687-.167-1.249-.749-1.304-1.512a11.158 11.158 0 0 1 0-1.594c.055-.763.617-1.345 1.304-1.512l1.45-.352c.078-.019.171-.09.221-.225.089-.248.19-.491.302-.728.061-.13.044-.246.002-.315l-.776-1.275c-.368-.603-.353-1.411.147-1.99.349-.402.726-.78 1.129-1.128.578-.501 1.386-.515 1.99-.147l1.274.776c.069.042.185.058.315-.002.238-.112.481-.213.728-.303.135-.048.205-.142.225-.22l.352-1.45c.167-.687.749-1.249 1.512-1.304C11.466 1.01 11.732 1 12 1Zm-.69 1.525c-.055.004-.135.05-.161.161l-.353 1.45a1.832 1.832 0 0 1-1.172 1.277 7.147 7.147 0 0 0-.6.249 1.833 1.833 0 0 1-1.734-.074l-1.274-.776c-.098-.06-.186-.036-.228 0a9.774 9.774 0 0 0-.976.976c-.036.042-.06.131 0 .228l.776 1.274c.314.529.342 1.18.074 1.734a7.147 7.147 0 0 0-.249.6 1.831 1.831 0 0 1-1.278 1.173l-1.45.351c-.11.027-.156.107-.16.162a9.63 9.63 0 0 0 0 1.38c.004.055.05.135.161.161l1.45.353a1.832 1.832 0 0 1 1.277 1.172c.074.204.157.404.249.6.268.553.24 1.204-.074 1.733l-.776 1.275c-.06.098-.036.186 0 .228.301.348.628.675.976.976.042.036.131.06.228 0l1.274-.776a1.83 1.83 0 0 1 1.734-.075c.196.093.396.176.6.25a1.831 1.831 0 0 1 1.173 1.278l.351 1.45c.027.11.107.156.162.16a9.63 9.63 0 0 0 1.38 0c.055-.004.135-.05.161-.161l.353-1.45a1.834 1.834 0 0 1 1.172-1.278 6.82 6.82 0 0 0 .6-.248 1.831 1.831 0 0 1 1.733.074l1.275.776c.098.06.186.036.228 0 .348-.301.675-.628.976-.976.036-.042.06-.131 0-.228l-.776-1.275a1.834 1.834 0 0 1-.075-1.733c.093-.196.176-.396.25-.6a1.831 1.831 0 0 1 1.278-1.173l1.45-.351c.11-.027.156-.107.16-.162a9.63 9.63 0 0 0 0-1.38c-.004-.055-.05-.135-.161-.161l-1.45-.353c-.626-.152-1.08-.625-1.278-1.172a6.576 6.576 0 0 0-.248-.6 1.833 1.833 0 0 1 .074-1.734l.776-1.274c.06-.098.036-.186 0-.228a9.774 9.774 0 0 0-.976-.976c-.042-.036-.131-.06-.228 0l-1.275.776a1.831 1.831 0 0 1-1.733.074 6.88 6.88 0 0 0-.6-.249 1.835 1.835 0 0 1-1.173-1.278l-.351-1.45c-.027-.11-.107-.156-.162-.16a9.63 9.63 0 0 0-1.38 0Z\"></path></svg>";
	var RUNNING_SVG = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><circle cx=\"8\" cy=\"8\" r=\"4\"/></svg>";
	var STAR_SVG = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><path d=\"M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707c-.28-.28-.576-.49-.888-.656L10.073 9.333l-.07 3.181a.5.5 0 0 1-.853.354l-3.535-3.536-4.243 4.243a.5.5 0 1 1-.707-.707l4.243-4.243L1.372 5.11a.5.5 0 0 1 .354-.854l3.18-.07L8.37.722A3.37 3.37 0 0 1 9.12.074a.5.5 0 0 1 .708.002l-.707.707z\"/></svg>";
	var TODAY_SVG = "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-12z\"/><path d=\"M16 3v4\"/><path d=\"M8 3v4\"/><path d=\"M4 11h16\"/><path d=\"M11 15h1\"/><path d=\"M12 15v3\"/></svg>";
	var ARCHIVE_SVG = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0\"><path d=\"m21.706 5.292-2.999-2.999A.996.996 0 0 0 18 2H6a.996.996 0 0 0-.707.293L2.294 5.292A.994.994 0 0 0 2 6v13c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V6a.994.994 0 0 0-.294-.708zM6.414 4h11.172l1 1H5.414l1-1zM4 19V7h16l.002 12H4z\"/><path d=\"M14 9h-4v3H7l5 5 5-5h-3z\"/></svg>";
	var GRID_SVG = "<svg width=\"14\" height=\"14\" stroke=\"currentColor\" fill=\"none\" stroke-width=\"2\" viewBox=\"0 0 24 24\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\"></rect><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\"></rect><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\"></rect><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\"></rect></svg>";
	var RESORT_SVG = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15\"/></svg>";
	var ADD_PROJECT_SVG = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 512 512\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0\"><path d=\"M512 416c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l128 0c20.1 0 39.1 9.5 51.2 25.6l19.2 25.6c6 8.1 15.5 12.8 25.6 12.8l160 0c35.3 0 64 28.7 64 64l0 256zM232 376c0 13.3 10.7 24 24 24s24-10.7 24-24l0-64 64 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-64 0 0-64c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 64-64 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l64 0 0 64z\"/></svg>";
	var _sfc_main = {
		__name: "App",
		setup(__props) {
			const plansRef = /* @__PURE__ */ ref(null);
			const memoryRef = /* @__PURE__ */ ref(null);
			const accountsRef = /* @__PURE__ */ ref(null);
			const accountDropdownRef = /* @__PURE__ */ ref(null);
			const projectsRef = /* @__PURE__ */ ref(null);
			const statusBarRef = /* @__PURE__ */ ref(null);
			const gridCardsRef = /* @__PURE__ */ ref(null);
			const projectViewerRef = /* @__PURE__ */ ref(null);
			const TABS = [
				{
					id: "sessions",
					label: "Sessions",
					svg: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 1200 1200\" fill=\"#d97757\" stroke=\"none\"><path d=\"M 233.959793 800.214905 L 468.644287 668.536987 L 472.590637 657.100647 L 468.644287 650.738403 L 457.208069 650.738403 L 417.986633 648.322144 L 283.892639 644.69812 L 167.597321 639.865845 L 54.926208 633.825623 L 26.577238 627.785339 L 3.3e-05 592.751709 L 2.73832 575.27533 L 26.577238 559.248352 L 60.724873 562.228149 L 136.187973 567.382629 L 249.422867 575.194763 L 331.570496 580.026978 L 453.261841 592.671082 L 472.590637 592.671082 L 475.328857 584.859009 L 468.724915 580.026978 L 463.570557 575.194763 L 346.389313 495.785217 L 219.543671 411.865906 L 153.100723 363.543762 L 117.181267 339.060425 L 99.060455 316.107361 L 91.248367 266.01355 L 123.865784 230.093994 L 167.677887 233.073853 L 178.872513 236.053772 L 223.248367 270.201477 L 318.040283 343.570496 L 441.825592 434.738342 L 459.946411 449.798706 L 467.194672 444.64447 L 468.080597 441.020203 L 459.946411 427.409485 L 392.617493 305.718323 L 320.778564 181.932983 L 288.80542 130.630859 L 280.348999 99.865845 C 277.369171 87.221436 275.194641 76.590698 275.194641 63.624268 L 312.322174 13.20813 L 332.8591 6.604126 L 382.389313 13.20813 L 403.248352 31.328979 L 434.013519 101.71814 L 483.865753 212.537048 L 561.181274 363.221497 L 583.812134 407.919434 L 595.892639 449.315491 L 600.40271 461.959839 L 608.214783 461.959839 L 608.214783 454.711609 L 614.577271 369.825623 L 626.335632 265.61084 L 637.771851 131.516846 L 641.718201 93.745117 L 660.402832 48.483276 L 697.530334 24.000122 L 726.52356 37.852417 L 750.362549 72 L 747.060486 94.067139 L 732.886047 186.201416 L 705.100708 330.52356 L 686.979919 427.167847 L 697.530334 427.167847 L 709.61084 415.087341 L 758.496704 350.174561 L 840.644348 247.490051 L 876.885925 206.738342 L 919.167847 161.71814 L 946.308838 140.29541 L 997.61084 140.29541 L 1035.38269 196.429626 L 1018.469849 254.416199 L 965.637634 321.422852 L 921.825562 378.201538 L 859.006714 462.765259 L 819.785278 530.41626 L 823.409424 535.812073 L 832.75177 534.92627 L 974.657776 504.724915 L 1051.328979 490.872559 L 1142.818848 475.167786 L 1184.214844 494.496582 L 1188.724854 514.147644 L 1172.456421 554.335693 L 1074.604126 578.496765 L 959.838989 601.449829 L 788.939636 641.879272 L 786.845764 643.409485 L 789.261841 646.389343 L 866.255127 653.637634 L 899.194702 655.409424 L 979.812134 655.409424 L 1129.932861 666.604187 L 1169.154419 692.537109 L 1192.671265 724.268677 L 1188.724854 748.429688 L 1128.322144 779.194641 L 1046.818848 759.865845 L 856.590759 714.604126 L 791.355774 698.335754 L 782.335693 698.335754 L 782.335693 703.731567 L 836.69812 756.885986 L 936.322205 846.845581 L 1061.073975 962.81897 L 1067.436279 991.490112 L 1051.409424 1014.120911 L 1034.496704 1011.704712 L 924.885986 929.234924 L 882.604126 892.107544 L 786.845764 811.48999 L 780.483276 811.48999 L 780.483276 819.946289 L 802.550415 852.241699 L 919.087341 1027.409424 L 925.127625 1081.127686 L 916.671204 1098.604126 L 886.469849 1109.154419 L 853.288696 1103.114136 L 785.073914 1007.355835 L 714.684631 899.516785 L 657.906067 802.872498 L 650.979858 806.81897 L 617.476624 1167.704834 L 601.771851 1186.147705 L 565.530212 1200 L 535.328857 1177.046997 L 519.302124 1139.919556 L 535.328857 1066.550537 L 554.657776 970.792053 L 570.362488 894.68457 L 584.536926 800.134277 L 592.993347 768.724976 L 592.429626 766.630859 L 585.503479 767.516968 L 514.22821 865.369263 L 405.825531 1011.865906 L 320.053711 1103.677979 L 299.516815 1111.812256 L 263.919525 1093.369263 L 267.221497 1060.429688 L 287.114136 1031.114136 L 405.825531 880.107361 L 477.422913 786.52356 L 523.651062 732.483276 L 523.328918 724.671265 L 520.590698 724.671265 L 205.288605 929.395935 L 149.154434 936.644409 L 124.993355 914.01355 L 127.973183 876.885986 L 139.409409 864.80542 L 234.201385 799.570435 L 233.879227 799.8927 Z\"/></svg>"
				},
				{
					id: "plans",
					label: "Plans",
					svg: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 17 17\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0\"><path d=\"M14 2v-2h-13v17h13v-2h2v-13h-2zM2 16v-15h2v15h-2zM13 16h-8v-15h8v15zM15 14h-1v-3h1v3zM15 10h-1v-3h1v3zM14 6v-3h1v3h-1zM6 4h5v1h-5v-1zM6 6h4v1h-4v-1z\"/></svg>"
				},
				{
					id: "memory",
					label: "Agent Files",
					svg: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z\"/><path d=\"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z\"/><path d=\"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4\"/><path d=\"M17.599 6.5a3 3 0 0 0 .399-1.375\"/><path d=\"M6.003 5.125A3 3 0 0 0 6.401 6.5\"/><path d=\"M3.477 10.896a4 4 0 0 1 .585-.396\"/><path d=\"M19.938 10.5a4 4 0 0 1 .585.396\"/><path d=\"M6 18a4 4 0 0 1-1.967-.516\"/><path d=\"M19.967 17.484A4 4 0 0 1 18 18\"/></svg>"
				},
				{
					id: "stats",
					label: "Stats",
					svg: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 512 512\" fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0\"><path d=\"M128 496H48V304h80zm224 0h-80V208h80zm112 0h-80V96h80zm-224 0h-80V16h80z\"/></svg>"
				},
				{
					id: "projects",
					label: "Projects",
					svg: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6a2 2 0 0 1 2-2h3.17a1 1 0 0 1 .71.29L10.24 5.7A1 1 0 0 0 11 6h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z\"/><line x1=\"7\" y1=\"12\" x2=\"17\" y2=\"12\"/><line x1=\"7\" y1=\"15.5\" x2=\"13\" y2=\"15.5\"/></svg>"
				},
				{
					id: "accounts",
					label: "Accounts",
					svg: "<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"8\" cy=\"6\" r=\"3.5\"/><path d=\"M1.5 21c0-4 2.9-7 6.5-7s6.5 3 6.5 7\"/><circle cx=\"17\" cy=\"8.5\" r=\"2.5\"/><path d=\"M14.5 21c0-2.8 1.8-5 4.5-5s4.5 2.2 4.5 5\"/></svg>"
				}
			];
			const searchPlaceholder = computed(() => {
				switch (store.activeTab) {
					case "plans": return "Search plans...";
					case "memory": return "Search agent files...";
					case "projects": return "Search projects…";
					default: return "Search sessions...";
				}
			});
			let searchDebounceTimer = null;
			function onSearchInput(e) {
				store.searchQuery = e.target.value;
				if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
				searchDebounceTimer = setTimeout(async () => {
					searchDebounceTimer = null;
					const query = store.searchQuery.trim();
					if (!query) {
						doClearSearch();
						return;
					}
					window.__sb?.search?.(query, store.searchTitlesOnly);
				}, 200);
			}
			function doClearSearch() {
				store.searchQuery = "";
				if (searchDebounceTimer) {
					clearTimeout(searchDebounceTimer);
					searchDebounceTimer = null;
				}
				window.__sb?.clearSearch?.();
			}
			async function toggleTitlesOnly() {
				store.searchTitlesOnly = !store.searchTitlesOnly;
				await window.api?.setSetting("searchTitlesOnly", store.searchTitlesOnly);
				if (store.searchQuery.trim()) window.__sb?.search?.(store.searchQuery.trim(), store.searchTitlesOnly);
			}
			function setTab(tabId) {
				if (tabId === store.activeTab) return;
				store.activeTab = tabId;
				store.searchQuery = "";
				store.searchMatchIds = null;
				store.searchMatchProjectPaths = null;
				window.__sb?.onTabChange?.(tabId);
			}
			function toggleFilter(filterName) {
				store[filterName] = !store[filterName];
				if (filterName === "showStarredOnly" && store.showStarredOnly) store.showRunningOnly = false;
				if (filterName === "showRunningOnly" && store.showRunningOnly) store.showStarredOnly = false;
				localStorage.setItem(filterName, store[filterName] ? "1" : "0");
				window.__sb?.onFilterChange?.({
					showStarredOnly: store.showStarredOnly,
					showRunningOnly: store.showRunningOnly,
					showTodayOnly: store.showTodayOnly,
					showArchived: store.showArchived
				});
			}
			function onGlobalSettings() {
				window.__sb?.openGlobalSettings?.();
			}
			function onResort() {
				window.__sb?.resort?.();
			}
			function onAddProject() {
				window.__sb?.addProject?.();
			}
			function onToggleGrid() {
				window.__sb?.toggleGridView?.();
			}
			const sidebarCallbacks = {
				openSession: (s) => window.__sb?.openSession?.(s),
				stopSession: (id) => window.__sb?.stopSession?.(id),
				toggleStar: (id) => window.__sb?.toggleStar?.(id),
				archiveSession: (id) => window.__sb?.archiveSession?.(id),
				forkSession: (id) => window.__sb?.forkSession?.(id),
				showJsonl: (id) => window.__sb?.showJsonl?.(id),
				launchConfig: (id) => window.__sb?.launchConfig?.(id),
				renameSession: (id, name) => window.__sb?.renameSession?.(id, name),
				newSession: (project) => window.__sb?.newSession?.(project),
				openSettings: (path) => window.__sb?.openSettings?.(path),
				archiveSessions: (sessions) => window.__sb?.archiveSessions?.(sessions),
				removeProject: (path) => window.__sb?.removeProject?.(path)
			};
			const planCallbacks = { openPlan: (plan) => window.__sb?.openPlan?.(plan) };
			const memoryCallbacks = { openMemory: (file) => window.__sb?.openMemory?.(file) };
			const accountsCallbacks = {
				switchAccount: (id) => window.__sb?.switchAccount?.(id),
				openAccountHomeSession: (acc) => window.__sb?.openAccountHomeSession?.(acc),
				renameAccount: (id, name) => window.__sb?.renameAccount?.(id, name),
				deleteAccount: (id) => window.__sb?.deleteAccount?.(id),
				createAccount: (name) => window.__sb?.createAccount?.(name)
			};
			const accountDropdownCallbacks = { switchAccount: (id) => window.__sb?.switchAccount?.(id) };
			const projectsCallbacks = {
				openProject: (p) => window.__sb?.openProject?.(p),
				newSession: (p) => window.__sb?.newSession?.(p),
				addProject: () => window.__sb?.addProject?.(),
				projectRemoved: () => window.__sb?.projectRemoved?.()
			};
			const projectViewerCallbacks = {
				newSession: (p) => window.__sb?.newSession?.(p),
				onTabChange: (tab) => window.__sb?.onPvTabChange?.(tab)
			};
			onMounted(async () => {
				Object.assign(window.vuePlans, {
					setPlans: (list) => plansRef.value?.setPlans(list),
					setActive: (f) => plansRef.value?.setActive(f),
					clearActive: () => plansRef.value?.clearActive()
				});
				Object.assign(window.vueMemory, {
					setMemories: (data, ids) => memoryRef.value?.setMemories(data, ids),
					setFilter: (ids) => memoryRef.value?.setFilter(ids),
					setActive: (f) => memoryRef.value?.setActive(f),
					clearActive: () => memoryRef.value?.clearActive()
				});
				Object.assign(window.vueAccounts, {
					setAccounts: (list, id) => accountsRef.value?.setAccounts(list, id),
					setActiveAccount: (id) => accountsRef.value?.setActiveAccount(id),
					setUsage: (usage) => accountsRef.value?.setUsage(usage)
				});
				Object.assign(window.vueAccountDropdown, {
					setAccounts: (list, id, usage) => accountDropdownRef.value?.setAccounts(list, id, usage),
					setActiveAccount: (id) => accountDropdownRef.value?.setActiveAccount(id),
					setUsage: (usage) => accountDropdownRef.value?.setUsage(usage),
					close: () => accountDropdownRef.value?.close()
				});
				Object.assign(window.vueProjects, {
					setProjects: (list) => projectsRef.value?.setProjects(list),
					setSearch: (q) => projectsRef.value?.setSearch(q),
					clearActive: () => projectsRef.value?.clearActive()
				});
				Object.assign(window.vueStatusBar, {
					setInfo: (text) => statusBarRef.value?.setInfo(text),
					setActivity: (text, type) => statusBarRef.value?.setActivity(text, type),
					setUpdater: (text, duration) => statusBarRef.value?.setUpdater(text, duration)
				});
				window.vueGrid = gridCardsRef.value;
				const worktreePattern = /^(.+?)\/\.claude\/worktrees\/([^/]+)\/?$/;
				window.vueProjectViewer = {
					open: (proj) => {
						const worktrees = store.projects.filter((p) => {
							const m = p.projectPath.match(worktreePattern);
							return m && m[1] === proj.projectPath;
						}).map((p) => ({
							projectPath: p.projectPath,
							name: p.projectPath.match(worktreePattern)?.[2] || p.projectPath
						}));
						projectViewerRef.value?.open(proj, worktrees);
					},
					close: () => projectViewerRef.value?.close(),
					setTab: (tab) => projectViewerRef.value?.setTab(tab)
				};
				window.vueApp = { setTab };
				window.openSettingsViewer = (scope, projectPath) => {
					for (const id of [
						"terminal-area",
						"placeholder",
						"plan-viewer",
						"stats-viewer",
						"memory-viewer",
						"jsonl-viewer",
						"project-viewer"
					]) {
						const el = document.getElementById(id);
						if (el) el.style.display = "none";
					}
					store.settingsScope = scope || "global";
					store.settingsProjectPath = projectPath || null;
					store.settingsOpen = true;
				};
				window.closeSettingsViewer = () => {
					store.settingsOpen = false;
					window._restoreAfterSettings?.();
				};
				if (await window.api?.getSetting("searchTitlesOnly")) store.searchTitlesOnly = true;
				store.showRunningOnly = localStorage.getItem("showRunningOnly") === "1";
				store.showStarredOnly = localStorage.getItem("showStarredOnly") === "1";
				store.showTodayOnly = localStorage.getItem("showTodayOnly") === "1";
				store.showArchived = localStorage.getItem("showArchived") === "1";
			});
			return (_ctx, _cache) => {
				return openBlock(), createElementBlock(Fragment, null, [
					createBaseVNode("div", {
						id: "sidebar",
						class: normalizeClass({ collapsed: unref(store).sidebarCollapsed })
					}, [
						createBaseVNode("button", {
							id: "sidebar-expand-btn",
							"data-tooltip": "Show sidebar",
							onClick: _cache[0] || (_cache[0] = ($event) => unref(store).sidebarCollapsed = false),
							innerHTML: EXPAND_SVG
						}),
						createBaseVNode("div", _hoisted_1, [createVNode(_sfc_main$9, {
							ref_key: "accountDropdownRef",
							ref: accountDropdownRef,
							callbacks: accountDropdownCallbacks
						}, null, 512)]),
						createBaseVNode("div", _hoisted_2, [createBaseVNode("div", _hoisted_3, [
							(openBlock(), createElementBlock(Fragment, null, renderList(TABS, (tab) => {
								return createBaseVNode("button", {
									key: tab.id,
									class: normalizeClass(["sidebar-tab", { active: unref(store).activeTab === tab.id }]),
									"data-tab": tab.id,
									"data-tooltip": tab.label,
									onClick: ($event) => setTab(tab.id),
									innerHTML: tab.svg
								}, null, 10, _hoisted_4);
							}), 64)),
							createBaseVNode("button", {
								id: "global-settings-btn",
								"data-tooltip": "Global settings",
								onClick: onGlobalSettings,
								innerHTML: GEAR_SVG
							}),
							createBaseVNode("button", {
								id: "sidebar-collapse-btn",
								"data-tooltip": "Hide sidebar",
								onClick: _cache[1] || (_cache[1] = ($event) => unref(store).sidebarCollapsed = true),
								innerHTML: COLLAPSE_SVG
							})
						]), withDirectives(createBaseVNode("div", _hoisted_5, [
							createBaseVNode("button", {
								id: "running-toggle",
								class: normalizeClass({ active: unref(store).showRunningOnly }),
								"data-tooltip": "Show running only",
								onClick: _cache[2] || (_cache[2] = ($event) => toggleFilter("showRunningOnly")),
								innerHTML: RUNNING_SVG
							}, null, 2),
							createBaseVNode("button", {
								id: "star-toggle",
								class: normalizeClass({ active: unref(store).showStarredOnly }),
								"data-tooltip": "Show pinned only",
								onClick: _cache[3] || (_cache[3] = ($event) => toggleFilter("showStarredOnly")),
								innerHTML: STAR_SVG
							}, null, 2),
							createBaseVNode("button", {
								id: "today-toggle",
								class: normalizeClass({ active: unref(store).showTodayOnly }),
								"data-tooltip": "Show today's sessions only",
								onClick: _cache[4] || (_cache[4] = ($event) => toggleFilter("showTodayOnly")),
								innerHTML: TODAY_SVG
							}, null, 2),
							createBaseVNode("button", {
								id: "archive-toggle",
								class: normalizeClass({ active: unref(store).showArchived }),
								"data-tooltip": "Show archived sessions",
								onClick: _cache[5] || (_cache[5] = ($event) => toggleFilter("showArchived")),
								innerHTML: ARCHIVE_SVG
							}, null, 2),
							withDirectives(createBaseVNode("span", { id: "loading-status" }, toDisplayString(unref(store).loadingStatus), 513), [[vShow, unref(store).loadingStatus]]),
							createBaseVNode("button", {
								id: "grid-toggle-btn",
								"data-tooltip": "Session overview",
								onClick: onToggleGrid,
								innerHTML: GRID_SVG
							}),
							createBaseVNode("button", {
								id: "resort-btn",
								"data-tooltip": "Re-sort sessions",
								onClick: onResort,
								innerHTML: RESORT_SVG
							}),
							createBaseVNode("button", {
								id: "add-project-btn",
								"data-tooltip": "Add project",
								onClick: onAddProject,
								innerHTML: ADD_PROJECT_SVG
							})
						], 512), [[vShow, unref(store).activeTab === "sessions"]])]),
						createBaseVNode("div", {
							id: "search-bar",
							class: normalizeClass({ "has-query": unref(store).searchQuery })
						}, [
							createBaseVNode("input", {
								id: "search-input",
								type: "text",
								placeholder: searchPlaceholder.value,
								value: unref(store).searchQuery,
								onInput: onSearchInput
							}, null, 40, _hoisted_6),
							createBaseVNode("button", {
								id: "search-clear",
								type: "button",
								"aria-label": "Clear search",
								onClick: doClearSearch
							}, "×"),
							createBaseVNode("button", {
								id: "search-titles-toggle",
								type: "button",
								class: normalizeClass({ active: unref(store).searchTitlesOnly }),
								"data-tooltip": "Search titles only",
								"aria-label": "Search titles only",
								onClick: toggleTitlesOnly
							}, "Tt", 2)
						], 2),
						withDirectives(createBaseVNode("div", _hoisted_7, [createVNode(_sfc_main$16, { callbacks: sidebarCallbacks })], 512), [[vShow, unref(store).activeTab === "sessions" && !unref(store).accountSwitching]]),
						unref(store).accountSwitching && unref(store).activeTab === "sessions" ? (openBlock(), createElementBlock("div", _hoisted_8, [..._cache[6] || (_cache[6] = [createBaseVNode("div", { class: "acct-spinner" }, null, -1), createBaseVNode("span", null, "Switching account…", -1)])])) : createCommentVNode("", true),
						withDirectives(createBaseVNode("div", _hoisted_9, [createVNode(_sfc_main$13, {
							ref_key: "plansRef",
							ref: plansRef,
							callbacks: planCallbacks
						}, null, 512)], 512), [[vShow, unref(store).activeTab === "plans"]]),
						withDirectives(createBaseVNode("div", _hoisted_10, [..._cache[7] || (_cache[7] = [createBaseVNode("div", { class: "plans-empty" }, "Click the Stats tab to view activity heatmap.", -1)])], 512), [[vShow, unref(store).activeTab === "stats"]]),
						withDirectives(createBaseVNode("div", _hoisted_11, [createVNode(_sfc_main$11, {
							ref_key: "memoryRef",
							ref: memoryRef,
							callbacks: memoryCallbacks
						}, null, 512)], 512), [[vShow, unref(store).activeTab === "memory"]]),
						withDirectives(createBaseVNode("div", _hoisted_12, [createVNode(_sfc_main$10, {
							ref_key: "accountsRef",
							ref: accountsRef,
							callbacks: accountsCallbacks
						}, null, 512)], 512), [[vShow, unref(store).activeTab === "accounts"]]),
						withDirectives(createBaseVNode("div", _hoisted_13, [createVNode(_sfc_main$8, {
							ref_key: "projectsRef",
							ref: projectsRef,
							callbacks: projectsCallbacks
						}, null, 512)], 512), [[vShow, unref(store).activeTab === "projects"]])
					], 2),
					_cache[11] || (_cache[11] = createBaseVNode("div", { id: "sidebar-resize-handle" }, null, -1)),
					createBaseVNode("div", _hoisted_14, [
						_cache[9] || (_cache[9] = createStaticVNode("<div id=\"placeholder\"><p>Select a session from the sidebar to begin.</p></div><div id=\"stats-viewer\" style=\"display:none;\"><div id=\"stats-viewer-header\"><span id=\"stats-viewer-title\">Activity</span></div><div id=\"stats-viewer-body\"></div></div><div id=\"memory-viewer\" style=\"display:none;\"></div><div id=\"plan-viewer\" style=\"display:none;\"></div>", 4)),
						unref(store).settingsOpen ? (openBlock(), createBlock(_sfc_main$3, { key: 0 })) : createCommentVNode("", true),
						createBaseVNode("div", _hoisted_15, [createVNode(_sfc_main$1, {
							ref_key: "projectViewerRef",
							ref: projectViewerRef,
							callbacks: projectViewerCallbacks
						}, null, 512)]),
						_cache[10] || (_cache[10] = createStaticVNode("<div id=\"jsonl-viewer\" style=\"display:none;\"><div id=\"jsonl-viewer-header\"><span id=\"jsonl-viewer-title\">Message History</span><span id=\"jsonl-viewer-session-id\"></span></div><div id=\"jsonl-viewer-body\"></div></div>", 1)),
						createBaseVNode("div", _hoisted_16, [createBaseVNode("div", _hoisted_17, [createVNode(_sfc_main$15)]), _cache[8] || (_cache[8] = createStaticVNode("<div id=\"terminal-header\" style=\"display:none;\"><div id=\"terminal-header-info\"><span id=\"terminal-header-name\"></span><span id=\"terminal-header-pty-title\" style=\"display:none;\"></span><span id=\"terminal-header-id\"></span><span id=\"terminal-header-shell\" style=\"display:none;\"></span><span id=\"terminal-header-account\" class=\"terminal-account-badge\" style=\"display:none;\"></span></div><div id=\"terminal-header-controls\"><span id=\"terminal-header-status\"></span><button id=\"terminal-stop-btn\" data-tooltip=\"Stop process\"><svg width=\"12\" height=\"12\" viewBox=\"0 0 12 12\" fill=\"currentColor\"><rect x=\"2\" y=\"2\" width=\"8\" height=\"8\" rx=\"1\"></rect></svg></button></div></div><div id=\"grid-viewer\" style=\"display:none;\"><div id=\"grid-viewer-header\"><span id=\"grid-viewer-title\">Session Overview</span><span id=\"grid-viewer-count\"></span></div></div><div id=\"terminals\"></div>", 3))])
					]),
					(openBlock(), createBlock(Teleport, { to: "#status-bar" }, [createVNode(_sfc_main$7, {
						ref_key: "statusBarRef",
						ref: statusBarRef
					}, null, 512)])),
					(openBlock(), createBlock(Teleport, { to: "#vue-grid-cards" }, [createVNode(_sfc_main$6, {
						ref_key: "gridCardsRef",
						ref: gridCardsRef
					}, null, 512)]))
				], 64);
			};
		}
	};
	//#endregion
	//#region src/vue/main.js
	window.vueStore = store;
	window.vueSidebar = {
		store,
		setProjects(projects) {
			store.projects = projects;
		},
		setActivePtyIds(ids) {
			store.activePtyIds = new Set(ids);
		},
		setActiveSession(id) {
			store.activeSessionId = id;
		},
		setBusy(sessionId, busy) {
			if (busy) store.sessionBusyState.set(sessionId, true);
			else store.sessionBusyState.delete(sessionId);
		},
		addAttention(sessionId) {
			store.attentionSessions.add(sessionId);
		},
		setResponseReady(sessionId) {
			store.responseReadySessions.add(sessionId);
			store.sessionBusyState.delete(sessionId);
		},
		clearNotifications(sessionId) {
			store.attentionSessions.delete(sessionId);
			store.responseReadySessions.delete(sessionId);
		},
		setFilters({ showStarredOnly, showRunningOnly, showTodayOnly, showArchived }) {
			if (showStarredOnly !== void 0) store.showStarredOnly = showStarredOnly;
			if (showRunningOnly !== void 0) store.showRunningOnly = showRunningOnly;
			if (showTodayOnly !== void 0) store.showTodayOnly = showTodayOnly;
			if (showArchived !== void 0) store.showArchived = showArchived;
		},
		setSearch(matchIds, matchProjectPaths) {
			store.searchMatchIds = matchIds;
			store.searchMatchProjectPaths = matchProjectPaths;
		},
		setVisibility(count, ageDays) {
			store.visibleSessionCount = count;
			store.sessionMaxAgeDays = ageDays;
		},
		setHeaderSession(session) {
			store.headerSession = session;
		},
		setHeaderPtyTitle(title) {
			store.headerPtyTitle = title || null;
		},
		setHeaderShellProfile(profile) {
			store.headerShellProfile = profile || null;
		},
		setHeaderAccount(name) {
			store.headerAccount = name || null;
		},
		clearHeader() {
			store.headerSession = null;
			store.headerPtyTitle = null;
			store.headerShellProfile = null;
			store.headerAccount = null;
		}
	};
	window.vuePlans = {};
	window.vueMemory = {};
	window.vueAccounts = {};
	window.vueProjects = {};
	window.vueStatusBar = {};
	window.vueAccountDropdown = {};
	window.vueGrid = {};
	createApp(_sfc_main).mount("#app-container");
	//#endregion
})();
