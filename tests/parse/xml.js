/*eslint no-console: 0*/

import should from 'should'
import parse from '../../src/parse'
import streamify from 'into-stream'
import collect from 'get-stream'

const data = `<root>
<item>
  <A>1</A>
  <B>2</B>
  <C>3</C>
</item>
<item>
  <A>4</A>
  <B>5</B>
  <C>6</C>
</item>
<item>
  <A>7</A>
  <B>8</B>
  <C>9</C>
</item>
</root>`

describe('parse xml', () => {
  it('should throw on bad selector', async () => {
    should.throws(() => parse('xml'))
    should.throws(() => parse('xml', { selector: null }))
  })
  it('should throw on bad options', async () => {
    should.throws(() => parse('xml', { autoFormat: 'yes' }))
  })
  it('should parse an array', async () => {
    const parser = parse('xml', { selector: 'root.item.*' })
    const stream = streamify(data).pipe(parser())
    const res = await collect.array(stream)
    res.should.eql([
      { A: '1', B: '2', C: '3' },
      { A: '4', B: '5', C: '6' },
      { A: '7', B: '8', C: '9' }
    ])
  })
  it('should parse an array with autoFormat', async () => {
    const parser = parse('xml', { selector: 'root.item.*', autoFormat: 'simple' })
    const stream = streamify(data).pipe(parser())
    const res = await collect.array(stream)
    res.should.eql([
      { A: 1, B: 2, C: 3 },
      { A: 4, B: 5, C: 6 },
      { A: 7, B: 8, C: 9 }
    ])
  })
  it('should parse an array with autoFormat aggressive', async () => {
    const parser = parse('xml', { selector: 'root.item.*', autoFormat: 'aggressive' })
    const stream = streamify(data).pipe(parser())
    const res = await collect.array(stream)
    res.should.eql([
      { a: 1, b: 2, c: 3 },
      { a: 4, b: 5, c: 6 },
      { a: 7, b: 8, c: 9 }
    ])
  })
  it('should parse a nested path', async () => {
    const parser = parse('xml', { selector: 'root.item.*.A', autoFormat: 'simple' })
    const stream = streamify(data).pipe(parser())
    const res = await collect.array(stream)
    res.should.eql([ 1, 4, 7 ])
  })
})
