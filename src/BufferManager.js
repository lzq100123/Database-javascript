'use strict'
const DBErrors = require('./DBErrors'),
    mkdirp = require('mkdirp'),
    async = require('async'),
    path = require('path'),
    BufferManager = {},
    fs = require('fs'),
    assert = require('assert'),
    sm = require('./StorageManager'),
    EventEmitter = require('events');;

var ReplacementStrategy = {
    RS_FIFO: 0,
    RS_LRU: 1,
    RS_CLOCK: 2,
    RS_LFU: 3,
    RS_LRU_K: 4
},
    PAGE_SIZE = sm.PAGE_SIZE,
    CODING = sm.CODING,
    Heap = require('heap'),
    LoopQueue = require('./LoopQueue'),
    Queue = require('./Queue'),
    File = require('./File'),
    BM_BufferPool = require('./BM_BufferPool');

class MyEmitter extends EventEmitter { };
var bmEmitter = new MyEmitter();
bmEmitter.on('forceFlushFinished', function (err, bp, file) {
    console.log('forceFlushFinished Event');
    if (isAllZero(bp.dirty)) {
        sm.closePageFile(file, function (err) {
            if (err) throw err;
            else console.log('file closed');
        });
    }
})

/**
 *The BM_PageHandle stores information about a page. 
 *The page number (position of the page in the page file) is stored in pageNum. 
 *The page number of the first data page in a page file is 0. The data field points to the area in memory storing the content of the page. This will usually be a page frame from your buffer pool.
 * 
 * @param {any} pageNum 
 * @param {Buffer} data - the return data, or input data, not the real data
 */
function BM_PageHandle(pageNum, data) {
    this.pageNum = pageNum;
    this.data = data;
}


BM_BufferPool.toString = function () {
    return 'hello ' + pageFile + ', ' + numPages + ', ' + strategy + ', ' + storage_page_map.toString() + ', ' + dirty.toString() + ', ' + fixcount.toString();
}

/**
 *  creates a new buffer pool with numPages page frames using the page replacement strategy strategy. 
 * The pool is used to cache pages from the page file with name pageFileName. 
 * Initially, all page frames should be empty. 
 * The page file should already exist, i.e., this method should not generate a new page file. 
 * stratData can be used to pass parameters for the page replacement strategy. 
 * 
 * @param {BM_BufferPool} bp 
 * @param {char} pageFileName path to the file
 * @param {int} numPages 
 * @param {ReplacementStrategy} strategy 
 */
BufferManager.initBufferPool = function (bp, pageFileName, numPages, strategy) {
    var fd;
    try {
        fd = fs.openSync(pageFileName, 'w+');
        bp.pageFile = pageFileName;
        bp.queueLength = 0;
        
        bp.strategy = strategy;
        bp.numPages = numPages;
        initSpace(numPages, bp);

    } catch (error) {
        throw error;
    }
}

function initSpace(numPages, bp) {
    bp.data = Buffer.alloc(sm.PAGE_SIZE * numPages);
    bp.storage_page_map = new Array(numPages);
    bp.fixcount = new Array(numPages);
    bp.dirty = new Array(numPages);

    switch (bp.strategy) {
        case 0:
            bp.queue = new Queue(numPages);
            break;
        case 1:
            bp.queue = new Heap();
            break;
        case 2:
            bp.queue = new LoopQueue(numPages);
            break;
        default:
            throw new DBErrors('No such strategy!', DBErrors.type.RC_RM_UNKOWN_DATATYPE);
    }
}

/**
 * destroys a buffer pool. 
 * This method should free up all resources associated with buffer pool. 
 * For example, it should free the memory allocated for page frames. 
 * If the buffer pool contains any dirty pages, then these pages should be written back to disk before destroying the pool. 
 * It is an error to shutdown a buffer pool that has pinned pages.
 * 
 * @param {any} bp 
 * @param {any} callback 
 */
BufferManager.shutdownBufferPool = function (bp) {
    if (bp.data = undefined)
        throw new DBErrors('Buffer pool Not defined!');
    else
        //check if there is pin page
        if (bp.strategy == ReplacementStrategy.RS_LRU)
            for (var i = 0; i < bp.fixcount.length; i++) {
                if (bp.fixcount[i] != 0) {
                    throw new DBErrors('Still pages are pinned!');
                }
            }
    //Objects (including Buffers) are tracked by the garbage collector and deallocated when there are no more references to it

    //WRITE DIRTYR PAGE BACK TO THE DISK
    BufferManager.forceFlushPool(bp);
}

/**
 * causes all dirty pages (with fix count 0) from the buffer pool to be written to disk.
 * 
 * @param {any} bp 
 */
BufferManager.forceFlushPool = function (bp) {
    sm.openPageFile(bp.pageFile, new File(), function (err, file) {
        if (err) throw err;
        for (var memPageNum = 0; memPageNum < bp.numPages; memPageNum++) {
            if (bp.dirty[memPageNum] == 1) {
                sm.ensureCapacity(3, file, function (err, file) {
                    //buf = Buffer.alloc(sm.PAGE_SIZE, '.', sm.COING);
                    if (err) throw err
                    var curPos = bp.storage_page_map[memPageNum];
                    var tmpNum = memPageNum;
                    sm.writeBlockWithOffset(curPos, file, bp.data, tmpNum, function (err) {
                        if (err) throw err
                        else {
                            bp.dirty[tmpNum] = 0;
                            bmEmitter.emit('forceFlushFinished', null, bp, file);
                        }

                    });
                });
            }
        }

    });
}

function isAllZero(array) {
    var result = 0;
    for (var i = 0; i < array.length; i++) {
        result = result | array[i];
        if (result > 0)
            return false;
    }

    return true;
}

/**
 * marks a page as dirty.
 * 
 * @param {BM_BufferPoort} bp 
 * @param {BM_PageHandle} page
 */
BufferManager.markDirty = function (bp, page) {
    bp.dirty[page.pageNum] = 1;
}

/**
 * unpins the page page. 
 * 
 * @param {BM_BufferPoort} bp 
 * @param {BM_PageHandle} page
 */
BufferManager.unpinPage = function (bp, page) {
    if (bp.fixcount[page.pageNum] > 0)
        bp.fixcount[page.pageNum]--;
}

/**
 * pinPage pins the page with page number pageNum. 
 * The buffer manager is responsible to set the pageNum field of the page handle passed to the method. 
 * Similarly, the data field should point to the page frame the page is stored in (the area in memory storing the content of the page).
 * 
 * @param {any} bp 
 * @param {BM_PageHandle} page - page in the file
 */
BufferManager.pinPage = function (bp, page, pageNum) {
    switch (bp.strategy) {
        case 0:
            FIFO_pinPage(bp, page);
            break;
        case 1:
            LRU_pinPage(bp, page);
            break;
        case 2:
            CLOCK_pinPage(bp, page);
            break;
        default:
    }
}

function FIFO_pinPage(bp, page) {
    if (bp.queue == undefined) {
        throw Error('The FIFO queue is not defined!');
    }
    var memPage = findMemPageId(page.pageNum);
    if (memPage !== null) {//if the page is in the buffer
        page.data = memPage;
        return;
    } else {
        var avaFrame;
        if (bp.numPages > bp.queue.length) {// the queue is not full
            avaFrame = findAvalableBuffer(bp);
        } else {// the queue is full
            avaFrame = bp.queue.pop();
        }
        //read from disk
        sm.safeReadBlock(bp.pageFile, bp.data, avaFrame, (err, buf) => {
            if (err) {
                bp.storage_page_map[avaFrame] = -1;
                dirty[avaFrame] = 0;
            }
        })
        bp.storage_page_map[avaFrame] = page.pageNum;
        bp.dirty[avaFrame] = 0;
        bp.queue.push(avaFrame);
        bp.queueLength++;

        page.data = avaFrame;
        return;
    }
}

function LRU_pinPage(bp, page) {
    if (bp.heap == undefined) {
        throw Error('The LRU queue is not defined!');
    }
    if (findMemPageId(page.pageNum)) {//if the page is in the buffer
        fixcount[page.pageNum]++;
    } else {
        if (page.pageNum > bp.queueLength) {// the queue is not full
            var avaFrame = findAvalableBuffer(bp);

            forcePage(bp, page);
            bp.storage_page_map[avaFrame] = page.pageNum;
            dirty[avaFrame] = 0;
            bp.heap.push(avaFrame);
            bp.queueLength++;
        } else {
            var memPage = bp.heap.pop();
            forcePage(bp, page);
            bp.storage_page_map[memPage] = page.pageNum;
            bp.queueLength--;
        }
    }
}

function CLOCK_pinPage(bp, page) {
    if (bp.heap == undefined) {
        throw Error('The LRU queue is not defined!');
    }
    if (findMemPageId(page.pageNum)) {//if the page is in the buffer
        fixcount[page.pageNum]++;
    } else {
        if (page.pageNum > bp.queueLength) {// the queue is not full
            var avaFrame = findAvalableBuffer(bp);

            forcePage(bp, page);
            bp.storage_page_map[avaFrame] = page.pageNum;
            dirty[avaFrame] = 0;
            bp.heap.push(avaFrame);
            bp.queueLength++;
        } else {
            var memPage = bp.heap.pop();
            forcePage(bp, page);
            bp.storage_page_map[memPage] = page.pageNum;
            bp.queueLength--;
        }
    }
}

function findAvalableBuffer(bp) {
    for (var i = 0; i < bp.numPages; i++) {
        if (bp.storage_page_map[i] == undefined) {
            return i;
        }
    }
}

function findFilePageId(bp, memPage) {
    return bp.storage_page_map[memPage];
}

function findMemPageId(bp, filePage) {
    try {
        for (var i = 0; i < bp.numPages; i++) {
            if (bp.storage_page_map[i] == filePage)
                return i;
        }
        return null;
    } catch (error) {
        throw error;
    }

}

/**
 * forcePage should write the current content of the page back to the page file on disk.
 * 
 * @param {any} bp 
 * @param {any} page 
 */
BufferManager.forcePage = function (bp, page) {
    var memPageNum = findMemPageId(bp, page.pageNum);
    if (memPageNum !== null) {
        if (bp.dirty[memPageNum] == 1) {
            writeOneBlockForOnce(bp.pageFile, page.pageNum, bp.data, memPageNum);
        } else {
            throw new DBErrors('Writting page is not dirty!');
        }
    } else {
        throw new DBErrors('Writting page is not in the buffer pool');
    }
}

function writeOneBlockForOnce(filename, pageNum, buf, offset) {
    sm.openPageFile(filename, new File, function (err, file) {
        sm.ensureCapacity(3, file, function (err, file) {
            //buf = Buffer.alloc(sm.PAGE_SIZE, '.', sm.COING);
            sm.writeBlockWithOffset(pageNum, file, buf, offset, function (err, buf) {
                if (err) console.error(err)
                sm.closePageFile(file, function () {
                    if (err) throw err;
                });
            });
        });
    });
}

/**
 * The getFrameContents function returns an array of PageNumbers (of size numPages) where the ith element is the number of the page stored in the ith page frame. 
 * An empty page frame is represented using the constant NO_PAGE.
 * 
 * @param {any} bp 
 * @returns 
 */
BufferManager.getFrameContents = function (bp) {
    return bp.storage_page_map;
}

/**
 * The getDirtyFlags function returns an array of bools (of size numPages) where the ith element is TRUE if the page stored in the ith page frame is dirty. 
 * Empty page frames are considered as clean.
 * @param {any} bp 
 */
BufferManager.getDirtyFlags = function (bp) {
    return bp.dirty;
}

/**
 * The getFixCounts function returns an array of ints (of size numPages) where the ith element is the fix count of the page stored in the ith page frame. Return 0 for empty page frames.
 * 
 * @param {any} bp 
 */
BufferManager.getFixCounts = function (bp) {
    return bp.fixcount;
}


/**
 * The getNumReadIO function returns the number of pages that have been read from disk since a buffer pool has been initialized. 
 * You code is responsible to initializing this statistic at pool creating time and update whenever a page is read from the page file into a page frame.
 * 
 * @param {any} bp 
 * @returns 
 */
BufferManager.getNumReadIO = function (bp) {
    return bp.readBlocksNum;
}

/**
 * getNumWriteIO returns the number of pages written to the page file since the buffer pool has been initialized.
 * 
 * @param {any} bp 
 */
BufferManager.getNumWriteIO = function (bp) {
    return bp.writeBlockNum;
}



BufferManager.ReplacementStrategy = ReplacementStrategy;

module.exports = BufferManager;