const { test } = require('brittle')
const tmp = require('test-tmp')
const { FIRST_USER_PREFIX } = require('../lib/constants')
const NamespacedDB = require('../index.js')

test('key construction', async (t) => {
  const prefix = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF])
  const key = Buffer.from('test key')

  const k = NamespacedDB._keyFrom(prefix, key)

  const expected = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0x74, 0x65, 0x73, 0x74, 0x20, 0x6B, 0x65, 0x79])
  t.is(Buffer.compare(k, expected), 0)
})

test('prefix <-> number', async (t) => {
  const prefix = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF])

  const first = NamespacedDB._prefixToNumber(prefix)
  t.is(first, 3735928559)

  const second = NamespacedDB._numberToPrefix(first + 1)
  t.is(Buffer.compare(second, Buffer.from([0xDE, 0xAD, 0xBE, 0xF0])), 0)

  const third = NamespacedDB._prefixToNumber(second)
  t.is(third, 3735928560)
})

test('namespace prefix generation', async (t) => {
  const db = new NamespacedDB(await tmp(t))

  const first = await db.namespace('first')
  t.is(Buffer.compare(first.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX)), 0)

  // Re-use
  const second = await db.namespace('first')
  t.is(Buffer.compare(second.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX)), 0)

  const third = await db.namespace('third')
  t.is(Buffer.compare(third.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX + 1)), 0)

  const fourth = await db.namespace('fourth')
  t.is(Buffer.compare(fourth.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX + 2)), 0)

  // Re-use
  const fifth = await db.namespace('third')
  t.is(Buffer.compare(third.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX + 1)), 0)

  const sixth = await db.namespace('sixth')
  t.is(Buffer.compare(sixth.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX + 3)), 0)

  // Re-use
  const seventh = await db.namespace('first')
  t.is(Buffer.compare(seventh.prefix, NamespacedDB._numberToPrefix(FIRST_USER_PREFIX)), 0) 

  await db.close()
})

test('basic put / get', async (t) => {
  const db = new NamespacedDB(await tmp(t))
  const n = await db.namespace('test')

  await n.put([{ key: Buffer.from('testKey'), val: Buffer.from('value of the test') }])

  const res = await n.get(Buffer.from('testKey'))
  t.is(Buffer.compare(res, Buffer.from('value of the test')), 0)

  await db.close()
})

test('path functionality', async (t) => {
  const a = await tmp(t)
  const b = await tmp(t)

  const dbA = new NamespacedDB(a)
  const dbB = new NamespacedDB(b)

  const namespaceA = await dbA.namespace('test')
  const namespaceB = await dbB.namespace('test')

  await namespaceA.put([{ key: Buffer.from('testKey'), val: Buffer.from('a value') }])
  await namespaceB.put([{ key: Buffer.from('testKey'), val: Buffer.from('b value') }])

  const firstA = await namespaceA.get(Buffer.from('testKey'))
  t.is(Buffer.compare(firstA, Buffer.from('a value')), 0)

  const firstB = await namespaceB.get(Buffer.from('testKey'))
  t.is(Buffer.compare(firstB, Buffer.from('b value')), 0)

  await dbA.close()
  await dbB.close()

  const dbANew = new NamespacedDB(a)
  const dbBNew = new NamespacedDB(b)

  const newNamespaceA = await dbANew.namespace('test')
  const newNamespaceB = await dbBNew.namespace('test')

  const secondA = await newNamespaceA.get(Buffer.from('testKey'))
  t.is(Buffer.compare(secondA, Buffer.from('a value')), 0)

  const secondB = await newNamespaceB.get(Buffer.from('testKey'))
  t.is(Buffer.compare(secondB, Buffer.from('b value')), 0)

  await dbANew.close()
  await dbBNew.close()
})

test('namespacing', async (t) => {
  const db = new NamespacedDB(await tmp(t))

  const first = await db.namespace('first')
  await first.put([{ key: Buffer.from('testKey'), val: Buffer.from('first value') }])

  const second = await db.namespace('second')
  const third = await db.namespace('third')

  await second.put([{ key: Buffer.from('testKey'), val: Buffer.from('second value') }])
  await third.put([{ key: Buffer.from('testKey'), val: Buffer.from('third value') }])

  const firstGet = await first.get(Buffer.from('testKey'))
  t.is(Buffer.compare(firstGet, Buffer.from('first value')), 0)

  const secondGet = await second.get(Buffer.from('testKey'))
  t.is(Buffer.compare(secondGet, Buffer.from('second value')), 0)

  const thirdGet = await third.get(Buffer.from('testKey'))
  t.is(Buffer.compare(thirdGet, Buffer.from('third value')), 0)

  await db.close()
})

test('batch put', async (t) => {
  const db = new NamespacedDB(await tmp(t))

  const n = await db.namespace('test namespace')

  const puts = [
    { key: Buffer.from('first'), val: Buffer.from('first value') },
    { key: Buffer.from('second'), val: Buffer.from('the second') },
    { key: Buffer.from('third'), val: Buffer.from('third') },
    { key: Buffer.from('fourth'), val: Buffer.from('value, the fourth') },
    { key: Buffer.from('fifth'), val: Buffer.from('5') }
  ]

  await n.put(puts)

  const firstGet = await n.get(Buffer.from('first'))
  t.is(Buffer.compare(firstGet, Buffer.from('first value')), 0)

  const thirdGet = await n.get(Buffer.from('third'))
  t.is(Buffer.compare(thirdGet, Buffer.from('third')), 0)

  const fifthGet = await n.get(Buffer.from('fifth'))
  t.is(Buffer.compare(fifthGet, Buffer.from('5')), 0)

  const secondGet = await n.get(Buffer.from('second'))
  t.is(Buffer.compare(secondGet, Buffer.from('the second')), 0)

  const fourthGet = await n.get(Buffer.from('fourth'))
  t.is(Buffer.compare(fourthGet, Buffer.from('value, the fourth')), 0)

  await db.close()
})