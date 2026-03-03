// This code lives in examples/v8/monomorphic-patterns.js
// Run with: node --allow-natives-syntax monomorphic-patterns.js

// const ITERATIONS = 10000000;
//
// class Point2D {
//     constructor(x, y) {
//         this.x = x;
//         this.y = y;
//     }
// }
//
// class Point3D {
//     constructor(x, y, z) {
//         this.x = x;
//         this.y = y;
//         this.z = z;
//     }
// }
//
// // This function's call site is MONOMORPHIC. It will always see Point2D objects.
// // V8 will heavily optimize this.
// function getX_Monomorphic(point) {
//     return point.x;
// }
//
// // This function's call site is POLYMORPHIC. It will see two different shapes.
// // V8 can handle this, but it's slower.
// function getX_Polymorphic(point) {
//     return point.x;
// }
//
// // ========= BENCHMARK =============
//
// // Prime the functions so V8 can optimize them
// for (let i = 0; i < 1000; i++) {
//     getX_Monomorphic(new Point2D(i, i));
//     // Pass both shapes to the polymorphic function
//     getX_Polymorphic(new Point2D(i, i));
//     getX_Polymorphic(new Point3D(i, i, i));
// }
//
// console.time("Monomorphic");
// let mono_sum = 0;
// for (let i = 0; i < ITERATIONS; i++) {
//     mono_sum += getX_Monomorphic(new Point2D(i, i));
// }
// console.timeEnd("Monomorphic");
//
// console.time("Polymorphic");
// let poly_sum = 0;
// for (let i = 0; i < ITERATIONS; i++) {
//     // Alternate between the two shapes
//     const point = i % 2 === 0 ? new Point2D(i, i) : new Point3D(i, i, i);
//     poly_sum += getX_Polymorphic(point);
// }
// console.timeEnd("Polymorphic");

// Note: Ensure sums are used to prevent V8 from optimizing away the loops.
// console.log(mono_sum, poly_sum);

// const buff1 = Buffer.alloc(10);
// console.log(buff1);

// // buffer-from.js
// const buf = Buffer.from('hey')
// console.log(buf[0]);
//
// buf[1] = 0x6f;
// console.log(buf.toString('utf-8'));

// const largeBuffer = Buffer.alloc(10 * 1024);
// const chunkSize = 1024;
// console.time("view creation")
// const view = largeBuffer.subarray(5000, 5000 + chunkSize);
// console.timeEnd("view creation")
//
//
// // --- The Full Copy ---
// console.time("copy creation");
// const copy = Buffer.alloc(chunkSize);
// largeBuffer.copy(copy, 0, 5000, 5000 + chunkSize);
// console.timeEnd("copy creation");

/* Push based streams */

import { EventEmitter } from 'events';

class simplePushStream extends EventEmitter {
    constructor(data) {
        super();
        this.data = data;
        this.index = 0;
    }

    start() {
        this._pushNext()
    }
    _pushNext() {
        if(this.index > this.data.length) {
            this.emit('end')
            return;
        }
        const chunk = this.data[this.index++]
        this.emit('data', chunk)
        setImmediate(() => this._pushNext())
    }
}

const stream = new simplePushStream([1,2,3, 4, 5]);
stream.on('data', (chunk)=> {
    console.log('Data received', chunk)
})
stream.on('end', ()=>{
    console.log('Data streaming finished')
})
// stream.start();

/* Pull-stream based example */

class simplePullStream {
    constructor(data) {
        this.data = data;
        this.index = 0;
    }
    next(){
        if(this.index >= this.data.length){
            return { done : true}
        }
        return { value : this.data[this.index++], done : false}
    }
}

const stream1 = new simplePullStream([1,2,3,4,5]);
let result = stream1.next()
while(!result.done){
    console.log(`Value : ${result.value}`);
    result = stream1.next()
}