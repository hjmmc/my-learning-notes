const PENDING = "pending"
const FULFILLED = "fulfilled"
const REJECTED = "rejected"

class Promise {
	constructor(excutor) {
		this.status = PENDING //状态值，只能从 PENDING->FULFILLED 或者 PENDING->REJECTED
		this.value = undefined //返回值
		this.reason = undefined //拒因
		//存放结果处理的函数
		this.onResolves = [] //同一个Promise可能多次调用then,故用数组存放所有回调 let p=new Promise(...) p.then(...) p.then(...)
		this.onRejects = [] //同上

		//首先定义直接 resolve 函数
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
			//resolve判断value是否是Promise或是thenable，确保返回值不是Promise/thenable，其它地方无需关心返回值直接resolve就好

			//1.是Promise
			if (value instanceof Promise) {
				value.then(resolve, reject)
			}
			//2.可能是thenable
			else if (value != null && ((typeof value === 'object') || (typeof value === 'function'))) {
				let called = false //防止thenable里会出现重复调用resolve/reject的情况
				//加入try/catch防止thenable出现错误
				try {
					let then = value.then //注1：为保证不多次触发get操作
					//是thenable,获取结果
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
					}
					//不是thenable
					else {
						_resolve(value)
					}
				} catch (e) {
					if (called) return
					called = true
					reject(e)
				}
			}
			//都不是，直接resolve
			else {
				_resolve(value)
			}
		}

		let reject = (reason) => {
			//回调必须异步执行
			setTimeout(() => {
				if (this.status === PENDING) {
					this.status = REJECTED
					this.reason = reason
					this.onRejects.forEach(cb => cb(reason))
				}
			})
		}

		try {
			//excutor 是一个函数，两个参数也是函数
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

		let newPromise = new Promise((resolve, reject) => {
			if (this.status === FULFILLED) {
				//回调函数必须异步执行
				setTimeout(() => {
					try {
						let x = onResolve(this.value) //执行回调得到结果x, 回调可能出错，所以要加try catch
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x) //设置新Promise的结果
					} catch (e) {
						reject(e)
					}

				})
			} else if (this.status === REJECTED) {
				//与this.status === FULFILLED相同
				setTimeout(() => {
					try {
						let x = onReject(this.reason)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
					} catch (e) {
						reject(e)
					}
				})
			} else if (this.status === PENDING) {
				//还没获取到结果，添加新的回调获取结果
				this.onResolves.push(value => {
					//这里已经是异步了,所以不用加setTimeout
					try {
						let x = onResolve(value)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
					} catch (e) {
						reject(e)
					}
				})
				//从回调中获取据因
				this.onRejects.push(reason => {
					try {
						let x = onReject(reason)
						if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
							return reject(new TypeError('循环引用'))
						}
						resolve(x)
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