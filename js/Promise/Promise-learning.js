/**
 * Promise 实现 遵循promise/A+规范
 * Promise/A+规范译文:
 * https://malcolmyu.github.io/2015/06/12/Promises-A-Plus/#note-4
 * 参考：https://www.jianshu.com/p/459a856c476f
 * 这是参考着文章自己慢慢实现的源码，最后优化完的是Promise.js
 *
 */

const PENDING = "pending"
const FULFILLED = "fulfilled"
const REJECTED = "rejected"

class Promise {
	constructor(excutor) {
		this.status = PENDING
		this.value = undefined
		this.reason = undefined
		this.excutor = excutor
		this.onResolves = [] //同一个Promise可能多次调用then,故用数组存放所有回调 let p=new Promise(...) p.then(...) p.then(...)
		this.onRejects = [] //同上

		let _resolve = value => {
			setTimeout(() => {
				if (this.status === PENDING) {
					this.status = FULFILLED
					this.value = value
					this.onResolves.forEach(cb => cb(value))
				}
			})
		}

		let resolve = value => {
			//注2：resolve全局判断value是否是Promise或是thenable，其它地方无需关心返回值直接resolve就好
			if (value instanceof Promise) {
				value.then(resolve, reject)
			} else if (value != null && ((typeof value === 'object') || (typeof value === 'function'))) {
				let called = false
				try {
					let then = value.then //注1：为保证不多次触发get操作
					if (typeof then === 'function') {
						then.call(value, ret => {
							if (called) return
							called = true
							resolve(ret)
						}, err => {
							if (called) return
							called = true
							reject(err)
						})
					} else {
						_resolve(value)
					}
				} catch (e) {
					if (called) return
					called = true
					reject(e)
				}
			} else {
				_resolve(value)
			}

		}

		let reject = reason => {
			//reject直接返回reason，不管reason是否是Promise或者thenable
			setTimeout(() => {
				if (this.status === PENDING) {
					this.status = REJECTED
					this.reason = reason
					this.onRejects.forEach(cb => cb(reason))
				}
			})
		}

		try {
			excutor(resolve, reject)
		} catch (e) {
			reject(e)
		}
	}

	then(onResolve, onReject) {
		//处理下非法值
		onResolve = typeof onResolve === "function" ? onResolve : value => value
		onReject = typeof onReject === "function" ? onReject : reason => {
			throw reason
		}

		//注意：并不需要处理onResolve onReject的返回值是否是Promise或是thenable，不管是何值都已在resolve函数里处理了

		//返回一个新的Promise
		let newPromise = new Promise((resolve, reject) => {
			//若还没有获取到结果就加入到相应的回调中
			if (this.status === PENDING) {
				this.onResolves.push(ret => {
					//这里已经是异步了
					try {
						let x = onResolve(ret)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
						//已经在resolve里处理了返回值，这里无需再次处理了
						//this.resolveReturn(newPromise, x, resolve, reject)
					} catch (e) {
						reject(e)
					}
				})
				this.onRejects.push(err => {
					//这里已经是异步了
					try {
						let x = onReject(err)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
						//已经在resolve里处理了返回值，这里无需再次处理了
						//this.resolveReturn(newPromise, x, resolve, reject)
					} catch (e) {
						reject(e)
					}
				})
			} else if (this.status === FULFILLED) {
				//then必须异步执行
				setTimeout(() => {
					try {
						let x = onResolve(this.value)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
						//已经在resolve里处理了返回值，这里无需再次处理了
						// this.resolveReturn(newPromise, x, resolve, reject)
					} catch (e) {
						reject(e)
					}
				})
			} else if (this.status === REJECTED) {
				//then必须异步执行
				setTimeout(() => {
					try {
						let x = onReject(this.reason)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
						//已经在resolve里处理了返回值，这里无需再次处理了
						//this.resolveReturn(newPromise, x, resolve, reject)
					} catch (e) {
						reject(e)
					}
				})
			}
		})

		return newPromise
	}

	catch (onReject) {
		return this.then(null, onReject)
	}

	//注意：已经在resolve里处理了返回值，这里无需再次处理了
	//该函数已废弃
	resolveReturn(newPromise, x, resolve, reject) {
		if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
			return reject(new TypeError('循环引用'))
		}
		//Promise
		if (x instanceof Promise) {
			if (x.status == PENDING) {
				x.then(ret => {
					this.resolveReturn(newPromise, ret, resolve, reject)
				}, err => {
					reject(err)
				})
			} else {
				x.then(resolve, reject)
			}
		}
		//thenable
		else if (x != null && ((typeof x === 'object') || (typeof x === 'function'))) {
			let called = false // 避免多次调用
			try {
				let then = x.then //注1：不能多次访问x.then属性
				if (typeof then === 'function') {
					// console.log(x.then) //不能多次访问x.then属性，在这里打印必会出错
					then.call(x, ret => {
						if (called) return
						called = true
						this.resolveReturn(newPromise, ret, resolve, reject)
					}, err => {
						if (called) return
						called = true
						reject(err)
					})
				} else {
					resolve(x)
				}
			} catch (e) {
				if (called) return
				called = true
				reject(e)
			}

		} else {
			resolve(x)
		}
	}
}

Promise.all = function(promises) {
	return new Promise((resolve, reject) => {
		let count = 0
		let rets = []
		promises.forEach((promise, index) => {
			promise.then(ret => {
				rets[index] = ret
				count++
				if (count == promises.length) {
					resolve(rets)
				}
			}, reject)
		})
	})
}

Promise.race = function(promises) {
	return new Promise((resolve, reject) => {
		promises.forEach((promise, index) => {
			promise.then(resolve, reject)
		})
	})
}

Promise.resolve = function(value) {
	return new Promise(resolve => {
		resolve(value)
	})
}

Promise.reject = function(reason) {
	return new Promise((resolve, reject) => {
		reject(reason)
	})
}

Promise.deferred = function() { // 延迟对象
	let defer = {}
	defer.promise = new Promise((resolve, reject) => {
		defer.resolve = resolve
		defer.reject = reject
	})
	return defer
}

module.exports = Promise

/**
	Promise/A+规范测试
	npm i promises-aplus-tests -g
	promises-aplus-tests Promise.js
*/

/*
// 注1：	下例中，每当get x的then属性时会触发一次++numberOfTimesThenWasRetrieved
//		为保证不多次触发get操作（会影响到x的正确性？）
//		故先赋值let then = x.then，再进行后续操作
var numberOfTimesThenWasRetrieved = 0
let x = Object.create(null, {
	then: {
		get: function() {
			++numberOfTimesThenWasRetrieved
			return function thenMethodForX(onFulfilled) {
				onFulfilled()
			}
		}
	}
})
**/

// 注2：	resolve需要判断value是否是Promise或是thenable
//		下例应该输出 aaa
// new Promise((resolve, reject) => {
// 	resolve(new Promise((r, e) => {
// 		r({
// 			then: (r1, e1) => {
// 				r1('aaa')
// 			}
// 		})
// 	}))
// }).then(ret => {
// 	console.log(ret)
// }).catch(err => {
// 	console.log('err', err)
// })