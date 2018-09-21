# Promise实现原理

本文主要参考 [Promise详解与实现（Promise/A+规范）](https://www.jianshu.com/p/459a856c476f)

不过上文的例子并非不是完全正确的，还有几个需要注意的地方。

为深入理解 Promise 本文使用 ES6 从头开始实现 Promise 。不多说了，看下我的实现记录吧。

## 1.首先写个大概的样子吧

直接从一个例子看是否能写出 Promise 的大概源码

例子: 假设有个 login 的 Promise ,login 成功后，同时执行 getUserMenu 和 getUserConfig 
```js
window.login = new Promise((resolve,reject)=>{
    setTimeout(()=>{
        resolve({err:0,data:{id:'10086',name:'xiaoming'}})
    },1000)
})

//模块1 App.vue
window.login.then(user=>{
    getUserMenu(user.id).then(...)
},err=>{
    console.log(err)
})

//模块2 config.vue
window.login.then(user=>{
    getUserConfig(user.id)
}).catch(err=>{
    console.log(err)
})
```

> a.从上例可知 Promise 构造函数接收一个函数1，函数1的两个参数是 resolve 函数和 reject 函数，这两个函数传入 value/reasion 改变 Promise 的状态。

> b.同一个Promise 的 then 函数可被多次调用

下面是代码↓↓↓

```js
const PENDING = "pending"
const FULFILLED = "fulfilled"
const REJECTED = "rejected"

class Promise {
    constructor(excutor) {
        this.status = PENDING  //状态值，只能从 PENDING->FULFILLED 或者 PENDING->REJECTED
        this.value = undefined //返回值
        this.reason = undefined //拒因
        //this.excutor = excutor
        //存放结果处理的函数
        this.onResolves = [] //同一个Promise可能多次调用then,故用数组存放所有回调 let p=new Promise(...) p.then(...) p.then(...)
        this.onRejects = [] //同上

        let resolve = (value)=>{
            //回调必须异步执行
            setTimeout(() => {
                if (this.status === PENDING) {
                    this.status = FULFILLED
                    this.value = value
                    this.onResolves.forEach(cb => cb(value))
                }
            })
        }

        let reject = (reason)=>{
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
        //TODO
    }

    catch (onReject) {
        return this.then(null, onReject)
    }
}

module.exports = Promise
```

然后分析下 then 函数

> a.then 返回值为一个新的 Promise

> b.then 参数可以是回调函数/Promise

> c.then 被调用时，Promise 状态有三种情况

> d.then 回调函数必须异步执行

```js
class Promise {
    ...

    then(onResolve, onReject){
        //处理下非法值
        onResolve = typeof onResolve === "function" ? onResolve : value => value
        onReject = typeof onReject === "function" ? onReject : reason => {
            throw reason
        }
        
        let newPromise = new Promise((resolve,reject)=>{
            if(this.status === FULFILLED){
                //回调函数必须异步执行
                setTimeout(()=>{
                    try {
                        let x = onResolve(this.value) //执行回调得到结果x, 回调可能出错，所以要加try catch
                        resolve(x) //设置新Promise的结果
                    } catch(e) {
                        reject(e)
                    }
                    
                })
            }else if(this.status === REJECTED){
                //与this.status === FULFILLED相同
                setTimeout(() => {
                    try {
                        let x = onReject(this.reason)
                        resolve(x)
                    } catch (e) {
                        reject(e)
                    }
                })
            }else if(this.status === PENDING){
                //还没获取到结果，添加新的回调获取结果
                this.onResolves.push(value => {
                    //这里已经是异步了,所以不用加setTimeout
                    try {
                        let x = onResolve(value)
                        resolve(x)
                    } catch (e) {
                        reject(e)
                    }
                })
                //从回调中获取据因
                this.onRejects.push(reason => {
                    try {
                        let x = onReject(reason)
                        resolve(x)
                    } catch (e) {
                        reject(e)
                    }
                })
            }
        })
        return newPromise
    }
}
```

这样我的 Promise 就能跑起来了

但，很显然我们没处理返回结果是 Promise/thenable 的情况

下面这个例子上述的 Promise 不能返回正确的结果

```js
new Promise((resolve0, reject0) => {
    resolve(new Promise((resolve1, reject1) => {
        resolve1({
            then: (resolve2, reject2) => {
                resolve2('aaa')
            }
        })
    }))
}).then(ret => {
    console.log(ret)
}).catch(err => {
    console.log('err', err)
})

//正确输出： aaa
//错误输出： Promise {...} 或 [Function]
```

所以要对应不同情况处理下 resolve value 的值

```js
class Promise {
    constructor(excutor) {
        ...

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
    }
}
```

最后实现一些静态方法
```js
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
```

这样我们的 Promise 就完成了

用github上的测试用例测试下
```
npm i promises-aplus-tests -g
promises-aplus-tests Promise.js
```
结果有两个bug
```
  870 passing (17s)
  2 failing

  1) 2.3.1: If `promise` and `x` refer to the same object, reject `promise` with a `TypeError' as the reason. via return from a fulfilled promise:
     Error: timeout of 200ms exceeded. Ensure the done() callback is being called in this test.


  2) 2.3.1: If `promise` and `x` refer to the same object, reject `promise` with a `TypeError' as the reason. via return from a rejected promise:
     Error: timeout of 200ms exceeded. Ensure the done() callback is being called in this test.
```

这是因为我们没处理返回值x===newPromise的情况，
加入判断
```js
let x = onResolve(this.value) 
if (newPromise === x) { // 如果从onResolve中返回的x 就是newPromise 就会导致循环引用报错
    return reject(new TypeError('循环引用'))
    }
resolve(x) 
```
最终代码：
```js
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
```

