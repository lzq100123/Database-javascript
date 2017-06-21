'use strict';
const assert = require('assert')
  , sm = require('../src/StorageManager.js')
  , path = require('path')
  , async = require('async');


var sleep = require('sleep')
  , File = require('../src/File')
  , util = require('../src/util')
  , fs = require('fs');


/**
 * ry to create, open, and close a page file 
 */
describe('Test create, open, and close file', function () {
  var filename = "file.test",
    file = new File();

  before(function () {
    if (fs.existsSync(filename))
      fs.unlinkSync(filename);
  });

  it('Should created a file named:' + filename, function () {
    sm.createPageFile(filename, function () {
      assert.equal(true, fs.existsSync(filename));
    });
  });

  it('Should open file successfull, and have right file handle', function () {
    sm.openPageFile(filename, file, function (file) {
      assert.equal(filename, file.fileName);//Should have right name in file handle
      assert.equal(1, file.totalPageNumber);//Expect 1 page in the new file
      assert.equal(0, file.curPagePos);//Fresh opened file\' page position should be 0
    });
  })

  it('Should closed the file successfully', function () {
    sm.closePageFile(file);
  })

  it('Should not find the file after deletion', function () {
    sm.destroyPageFile(file, function () {
      assert.equal(false, fs.existsSync(filename));
    });
  })

});

/**
 * Try to write and read file
 */
describe('Test open, write, read, and close', function () {
  var filename = "file.test",
    file = new File(),
    buf = Buffer.alloc(sm.PAGE_SIZE),
    tmp = Buffer.alloc(sm.PAGE_SIZE, "aba", sm.CODING);

  before(function () {
    if (fs.existsSync(filename))
      fs.unlinkSync(filename);
  });

  it('Should created a file named:' + filename, function () {
    sm.createPageFile(filename, function () {
      assert.equal(true, fs.existsSync(filename));
    });
  });
  it('Should open file successfull, and have right file handle', function () {
    sm.openPageFile(filename, file, function () {
      assert.equal(1, file.totalPageNumber);
    });
    sleep.msleep(1);

  });
  it('Expect zero byte in first page of freshly initialized page', function () {
    sm.openPageFile(filename, new File(), function (err, file) {
      sm.readFirstBlock(file, Buffer.alloc(sm.PAGE_SIZE), function (err, memPage) {
        assert.equal(0, memPage[0]);
      })
    });
  })

  describe('Test writting to three block', () => {
    if ('should write to 1 block with right content', () => {
      var buf = Buffer.alloc(sm.PAGE_SIZE, 'a', sm.COING);
      examWriteContent(buf, 0);
    });

    if ('should write to 2 block with right content', () => {
      var buf = Buffer.alloc(sm.PAGE_SIZE, 'b', sm.COING);
      examWriteContent(buf, 1);
    });

    if ('should write to 2 block with right content', () => {
      var buf = Buffer.alloc(sm.PAGE_SIZE, 'c', sm.COING);
      examWriteContent(buf, 2);
    });
  });
});

describe('Test Read cur, next, pre, etct read operation', () => {
  var filename = 'file_13.test';
  var file, buf;
  before(() => {
    //init the file
  })


  sm.safeWriteBlock(filename, Buffer.alloc(sm.PAGE_SIZE, 'a', sm.COING), 0, 0, () => {
    sm.safeWriteBlock(filename, Buffer.alloc(sm.PAGE_SIZE, 'b', sm.COING), 0, 1, () => {
      sm.safeWriteBlock(filename, Buffer.alloc(sm.PAGE_SIZE, 'c', sm.COING), 0, 2, () => {
        //open file
        file = new File();
        sm.openPageFile(filename, file, function () {
          assert.equal(3, file.totalPageNumber);

          it('Read previous block of 2nd block', function () {
            file.curPagePos = 1;
            buf = Buffer.alloc(sm.PAGE_SIZE, 'a', 'utf8');
            sm.readPreviousBlock(file, Buffer.alloc(sm.PAGE_SIZE, ' ', 'utf8'), function (err, rbuf) {
              assert.equal(buf.compare(rbuf));
            })
          })

          it('Read next block of 2nd block', function () {
            file.curPagePos = 1;
            buf = Buffer.alloc(sm.PAGE_SIZE, 'c', 'utf8');
            sm.readNextBlock(file, Buffer.alloc(sm.PAGE_SIZE, ' ', 'utf8'), function (err, rbuf) {
              assert.equal(buf.compare(rbuf));
            })
          })

          it('Read last block of 2nd block', function () {
            file.curPagePos = 1;
            buf = Buffer.alloc(sm.PAGE_SIZE, 'c', 'utf8');
            sm.readLastBlock(file, Buffer.alloc(sm.PAGE_SIZE, ' ', 'utf8'), function (err, rbuf) {
              assert.equal(buf.compare(rbuf));
            })
          })

          it('Read frist block of 2nd block', function () {
            file.curPagePos = 1;
            buf = Buffer.alloc(sm.PAGE_SIZE, 'a', 'utf8');
            sm.readFirstBlock(file, Buffer.alloc(sm.PAGE_SIZE, ' ', 'utf8'), function (err, rbuf) {
              assert.equal(buf.compare(rbuf));
            })
          })
        });
      });
    });
  });


});

function examWriteContent(content, pageNum) {
  sm.safeWriteBlock(filename, buf, 0, pageNum, () => {
    var exp = Buffer.alloc(sm.PAGE_SIZE);
    sm.safeReadBlock(filename, expc, 0, pageNum, () => {
      assert.equal(true, exp.compare(buf))
    });
  });
}
    // sm.openPageFile(filename, file, function () {
    //   buf = Buffer.alloc(sm.PAGE_SIZE, 'a', sm.COING);
    //   sm.writeBlock(0, file, buf, function (err, buf) {
    //     if (err) console.error(err)
    //     else {
    //       assert('a', buf[0]);
    //       buf = Buffer.alloc(sm.PAGE_SIZE, 'b', sm.COING);
    //       sm.writeBlock(1, file, buf, function (err, buf) {
    //         if (err) console.error(err)
    //         else {
    //           assert('b', buf[4096]);
    //           buf = Buffer.alloc(sm.PAGE_SIZE, 'c', sm.COING);
    //           sm.writeBlock(2, file, buf, function (err, buf) {
    //             if (err) console.error(err)
    //             else {
    //               assert('c', buf[4096 * 2]);
    //             }
    //           });
    //         }
    //       });
    //     }

    //   });//sm.write

    // });//open file
