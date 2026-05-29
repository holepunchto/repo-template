const RocksDB = require('rocksdb-native')
const b4a = require('b4a')
const Namespace = require('./lib/namespace')
const { SYSTEM_PREFIX, FIRST_USER_PREFIX } = require('./lib/constants')

module.exports = class NamespacedDB {
  constructor(path) {
    this.path = path
    this.db = new RocksDB(path)
    this._lock = Promise.resolve()
  }

  _withLock(fn) {
    const next = this._lock.then(fn)
    this._lock = next.catch(() => {})
    return next
  }

  static _keyFrom(prefix, key) {
    return b4a.concat([prefix, key])
  }

  static _prefixToNumber(p) {
    return p.readUint32BE(0)
  }

  static _numberToPrefix(n) {
    const buf = b4a.allocUnsafe(4)
    buf.writeUint32BE(n, 0)
    return buf
  }

  async _get(prefix, key) {
    const k = NamespacedDB._keyFrom(prefix, key)
    const r = this.db.read({ autoDestroy: true })
    const v = r.get(k)
    r.tryFlush()
    return await v
  }

  static _prefixUpperBound(buf) {
    const upper = b4a.from(buf)

    for (let i = upper.length - 1; i >= 0; i -= 1) {
      if (upper[i] < 0xFF) {
        upper[i] += 1
        return upper.subarray(0, i + 1)
      }
    }
    
    return null
  }

  async _getAll(prefix, keyPrefix) {
    const gte = NamespacedDB._keyFrom(prefix, keyPrefix)
    const lt = NamespacedDB._prefixUpperBound(gte)

    const iter = this.db.iterator(lt === null ? { gte } : { gte, lt })
    const results = []

    for await (const { value } of iter) results.push(value)

    return results
  }

  async _put(puts) {
    const w = this.db.write({ autoDestroy: true })

    for (const { prefix, key, val } of puts) {
      const k = NamespacedDB._keyFrom(prefix, key)
      w.tryPut(k, val)
    }

    await w.flush()
  }

  async close({ force } = {}) {
    return this._withLock(() => this.db.close({ force }))
  }

  async namespace(name) {
    return this._withLock(async () => {
      const prefix = NamespacedDB._numberToPrefix(SYSTEM_PREFIX.REG)

      let id = await this._get(prefix, b4a.from(`/namespace/name/${name}`))

      if (id === null) {
        let nextID = await this._get(prefix, b4a.from('/namespace/nextID'))

        if (nextID === null) nextID = NamespacedDB._numberToPrefix(FIRST_USER_PREFIX)

        const nextIDNumber = NamespacedDB._prefixToNumber(nextID)
        const newID = NamespacedDB._numberToPrefix(nextIDNumber + 1)

        await this._put([
          { prefix, key: b4a.from(`/namespace/name/${name}`), val: nextID },
          { prefix, key: b4a.from(`/namespace/${nextIDNumber}`), val: b4a.from(name) },
          { prefix, key: b4a.from('/namespace/nextID'), val: newID }
        ])

        id = nextID
      }

      return new Namespace(this, id)
    })
  }
}