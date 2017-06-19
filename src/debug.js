'use strict';
var sm = require('./StorageManager')
    , fs = require('fs')
    , File = require('./File')
    , util = require('./util'),
    assert = require('assert'),
    Queue = require('./Queue');

var bm = require('./BufferManager');
var BM_PageHandle = require('./BufferManagerHelper');

var LoopQueue = require('./LoopQueue'),
    Heap = require('heap');

const async = require('async');
var filename = '/Users/matthewxfz/Workspaces/gits/Database-javascript/file2.test',
    fileName = "/Users/matthewxfz/Workspaces/tmp/write.test",
    fileName2 = "/Users/matthewxfz/Workspaces/tmp/fake.test",
    file,
    buf;
function BM_BufferPool(pageFile, numPages, strategy, mgmtData) {
    this.pageFile = pageFile;
    this.numPages = numPages;
    this.strategy = strategy;
    this.mgmtData = mgmtData;
}


testLRU();








function testWriteStream(callback) {
    buf = Buffer.alloc(2 * 4096).fill('a', 0, 4095);
    buf.fill('b', 4096, 2 * 4096 - 1);
    sm.safeWriteBlock(new File(0,filename),buf,1,0);
    sm.safeWriteBlock(new File(0,filename),buf,0,1);
    
}

function safeWriteBlock(file, buf, offset, callback) {
    var opt = {
        flags: 'w+',
        defaultEncoding: 'utf8',
        fd: null,
        mode: 0o666,
        autoClose: true,
        start: offset
    }
    var writeStream = fs.createWriteStream(file.fileName, opt);

    keepWrite(callback);
    function keepWrite(callback) {
        var ok = writeStream.write(buf, 'utf8', callback);
        if (!ok)
            writeStream.once('drain', keepWrite());
    }
}



function testQueue() {
    var fixcount = [0, 0, 1, 0];
    var queue = new Queue(4, fixcount);
    queue.push(2);
    queue.push(0);
    queue.push(3);
    queue.push(1);

    console.log(queue.pop());
    console.log(queue.pop());
    console.log(queue.pop());
    queue.push(5);
    console.log(queue.pop());

}


function testFIFO() {
    var file = new File();

    var bp = new BM_BufferPool(fileName, 1, bm.ReplacementStrategy.RS_FIFO);
    var data;
    var page = new BM_PageHandle(1, data);
    bm.initBufferPool(bp, fileName, 3, bm.ReplacementStrategy.RS_FIFO, page);
    for (var i = 0; i < 22; i++) {
        page.pageNum = i;
        bm.pinPage(bp, page, i);
        bm.markDirty(bp, page);
        bm.unpinPage(bp, page);
        console.log('Page, ' + page.pageNum + ', ' + page.data + ', ' + bp.dirty[page.data] + ', fixcount, ' + bp.fixcount[page.data]);
    }

    bm.shutdownBufferPool(bp);
}

function testLRU() {
    var file = new File();

    var bp = new BM_BufferPool(fileName, 1, bm.ReplacementStrategy.RS_LRU);
    var data;
    var page = new BM_PageHandle(1, data);
    bm.initBufferPool(bp, fileName, 3, bm.ReplacementStrategy.RS_FIFO, page);
    for (var i = 0; i < 3; i++) {
        page.pageNum = i;
        bm.pinPage(bp, page, i);
        bm.markDirty(bp, page);
        bm.unpinPage(bp, page);
        console.log('Page, ' + page.pageNum + ', ' + page.data + ', ' + bp.dirty[page.data] + ', fixcount, ' + bp.fixcount[page.data]);
    }
    bm.pinPage(bp, page, 3);

    bm.shutdownBufferPool(bp);
}

function testSafeReadBlock() {
    buf = Buffer.alloc(8196);
    sm.safeReadBlock(filename, buf, 0, (err, buf) => {
        console.log(buf.toString('utf8'));
        console.log(buf.length);

    })
}
function testReadStream(callback) {
    const opt = {
        flags: 'r',
        encoding: 'utf8',
        fd: null,
        mode: 0o666,
        autoClose: true,
        start: 0,
        end: 4096
    };
    var readStream = fs.createReadStream(filename, opt);
    buf = Buffer.alloc(4096);
    readStream.on('data', (chunk) => {
        buf.write(chunk, 'utf8');
    });
    readStream.on('end', () => {
        callback(buf);
    });
}

function testBP() {
    var file = new File();

    var bp = new BM_BufferPool(fileName, 1, bm.ReplacementStrategy.RS_FIFO);
    var data;
    var page = new BM_PageHandle(1, data);
    bm.initBufferPool(bp, filename, 3, bm.ReplacementStrategy.RS_FIFO, page);

    bp.dirty[0] = 1;
    bp.dirty[1] = 1;
    bp.dirty[2] = 1;

    bp.storage_page_map[0] = 0;
    bp.storage_page_map[1] = 1;
    bp.storage_page_map[2] = 2;

    bp.pageFile = filename;

    page.pageNum = 0;
    bp.data.write("1st floor", sm.PAGE_SIZE * page.pageNum, sm.PAGE_SIZE * (page.pageNum + 1));
    bm.forcePage(bp, page)

    page.pageNum = 1;
    bp.data.write("2nd floor", sm.PAGE_SIZE * page.pageNum, sm.PAGE_SIZE * (page.pageNum + 1));
    bm.forcePage(bp, page);

    page.pageNum = 2;
    bp.data.write("3rd floor", sm.PAGE_SIZE * page.pageNum, sm.PAGE_SIZE * (page.pageNum + 1));
    bm.forcePage(bp, page);
}


function testFlushPool() {
    var bp = new BM_BufferPool(filename, 1, bm.ReplacementStrategy.RS_FIFO);
    bp.numPages = 3;
    var data;
    var page = new BM_PageHandle(1, data);
    bm.initBufferPool(bp, filename, 3, bm.ReplacementStrategy.RS_FIFO, page);

    for (var i = 0; i < bp.numPages; i++) {
        bp.data.write(i + "st floor, hahahahahah", sm.PAGE_SIZE * i, sm.PAGE_SIZE * (i + 1));
    }

    bp.dirty[0] = 1;
    bp.dirty[1] = 1;
    bp.dirty[2] = 1;

    bp.storage_page_map[0] = 2;
    bp.storage_page_map[1] = 1;
    bp.storage_page_map[2] = 0;

    bm.forceFlushPool(bp);
}

function testMultiwrite() {
    var file = new File();
    buf = (Buffer.alloc(sm.PAGE_SIZE));
    buf.write('asdfasdfasdfsadfadsfadsfasd!safdfasdfasdfadsfasdfsadfasdfasdfasdfasdfasd', 0);

    writeAlong(filename, 0, buf);
    buf = (Buffer.alloc(sm.PAGE_SIZE));
    buf.write('asdfasdfasdfsadfadsfadsfasd!safdfasdfasdfadsfasdfsadfasdfasdfasdfasdfasd', 0);

    writeAlong(filename, 1, buf);
}

function forcePage2(bp, page) {
    writeAlong(bp.pageFile, page.pageNum, page.data);
}

function writeAlong(filename, pageNum, buf) {
    sm.openPageFile(filename, new File, function (err, file) {
        sm.ensureCapacity(3, file, function (err, file) {
            //buf = Buffer.alloc(sm.PAGE_SIZE, '.', sm.COING);
            sm.writeBlock(pageNum, file, buf, function (err, buf) {
                if (err) console.error(err)
                sm.closePageFile(file, function () {
                    if (err) throw err;
                });
            });
        });
    });
}





