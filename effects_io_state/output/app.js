var i$bigInt = (function() {
// Copyright (c) 2005  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Basic JavaScript BN library - subset useful for RSA encryption.

// Bits per digit
var dbits;

// JavaScript engine analysis
var canary = 0xdeadbeefcafe;
var j_lm = ((canary&0xffffff)==0xefcafe);

// (public) Constructor
function BigInteger(a,b,c) {
  if(a != null)
    if("number" == typeof a) this.fromNumber(a,b,c);
    else if(b == null && "string" != typeof a) this.fromString(a,256);
    else this.fromString(a,b);
}

// return new, unset BigInteger
function nbi() { return new BigInteger(null); }

// am: Compute w_j += (x*this_i), propagate carries,
// c is initial carry, returns final carry.
// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
// We need to select the fastest one that works in this environment.

// am1: use a single mult and divide to get the high bits,
// max digit bits should be 26 because
// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
function am1(i,x,w,j,c,n) {
  while(--n >= 0) {
    var v = x*this[i++]+w[j]+c;
    c = Math.floor(v/0x4000000);
    w[j++] = v&0x3ffffff;
  }
  return c;
}
// am2 avoids a big mult-and-extract completely.
// Max digit bits should be <= 30 because we do bitwise ops
// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
function am2(i,x,w,j,c,n) {
  var xl = x&0x7fff, xh = x>>15;
  while(--n >= 0) {
    var l = this[i]&0x7fff;
    var h = this[i++]>>15;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x7fff)<<15)+w[j]+(c&0x3fffffff);
    c = (l>>>30)+(m>>>15)+xh*h+(c>>>30);
    w[j++] = l&0x3fffffff;
  }
  return c;
}
// Alternately, set max digit bits to 28 since some
// browsers slow down when dealing with 32-bit numbers.
function am3(i,x,w,j,c,n) {
  var xl = x&0x3fff, xh = x>>14;
  while(--n >= 0) {
    var l = this[i]&0x3fff;
    var h = this[i++]>>14;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x3fff)<<14)+w[j]+c;
    c = (l>>28)+(m>>14)+xh*h;
    w[j++] = l&0xfffffff;
  }
  return c;
}
var in_browser = typeof navigator !== "undefined"
if(in_browser && j_lm && (navigator.appName == "Microsoft Internet Explorer")) {
  BigInteger.prototype.am = am2;
  dbits = 30;
}
else if(in_browser && j_lm && (navigator.appName != "Netscape")) {
  BigInteger.prototype.am = am1;
  dbits = 26;
}
else { // Mozilla/Netscape seems to prefer am3
  BigInteger.prototype.am = am3;
  dbits = 28;
}

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = ((1<<dbits)-1);
BigInteger.prototype.DV = (1<<dbits);

var BI_FP = 52;
BigInteger.prototype.FV = Math.pow(2,BI_FP);
BigInteger.prototype.F1 = BI_FP-dbits;
BigInteger.prototype.F2 = 2*dbits-BI_FP;

// Digit conversions
var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
var BI_RC = new Array();
var rr,vv;
rr = "0".charCodeAt(0);
for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
rr = "a".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
rr = "A".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

function int2char(n) { return BI_RM.charAt(n); }
function intAt(s,i) {
  var c = BI_RC[s.charCodeAt(i)];
  return (c==null)?-1:c;
}

// (protected) copy this to r
function bnpCopyTo(r) {
  for(var i = this.t-1; i >= 0; --i) r[i] = this[i];
  r.t = this.t;
  r.s = this.s;
}

// (protected) set from integer value x, -DV <= x < DV
function bnpFromInt(x) {
  this.t = 1;
  this.s = (x<0)?-1:0;
  if(x > 0) this[0] = x;
  else if(x < -1) this[0] = x+this.DV;
  else this.t = 0;
}

// return bigint initialized to value
function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

// (protected) set from string and radix
function bnpFromString(s,b) {
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 256) k = 8; // byte array
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else { this.fromRadix(s,b); return; }
  this.t = 0;
  this.s = 0;
  var i = s.length, mi = false, sh = 0;
  while(--i >= 0) {
    var x = (k==8)?s[i]&0xff:intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-") mi = true;
      continue;
    }
    mi = false;
    if(sh == 0)
      this[this.t++] = x;
    else if(sh+k > this.DB) {
      this[this.t-1] |= (x&((1<<(this.DB-sh))-1))<<sh;
      this[this.t++] = (x>>(this.DB-sh));
    }
    else
      this[this.t-1] |= x<<sh;
    sh += k;
    if(sh >= this.DB) sh -= this.DB;
  }
  if(k == 8 && (s[0]&0x80) != 0) {
    this.s = -1;
    if(sh > 0) this[this.t-1] |= ((1<<(this.DB-sh))-1)<<sh;
  }
  this.clamp();
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) clamp off excess high words
function bnpClamp() {
  var c = this.s&this.DM;
  while(this.t > 0 && this[this.t-1] == c) --this.t;
}

// (public) return string representation in given radix
function bnToString(b) {
  if(this.s < 0) return "-"+this.negate().toString(b);
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else return this.toRadix(b);
  var km = (1<<k)-1, d, m = false, r = "", i = this.t;
  var p = this.DB-(i*this.DB)%k;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
    while(i >= 0) {
      if(p < k) {
        d = (this[i]&((1<<p)-1))<<(k-p);
        d |= this[--i]>>(p+=this.DB-k);
      }
      else {
        d = (this[i]>>(p-=k))&km;
        if(p <= 0) { p += this.DB; --i; }
      }
      if(d > 0) m = true;
      if(m) r += int2char(d);
    }
  }
  return m?r:"0";
}

// (public) -this
function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

// (public) |this|
function bnAbs() { return (this.s<0)?this.negate():this; }

// (public) return + if this > a, - if this < a, 0 if equal
function bnCompareTo(a) {
  var r = this.s-a.s;
  if(r != 0) return r;
  var i = this.t;
  r = i-a.t;
  if(r != 0) return (this.s<0)?-r:r;
  while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
  return 0;
}

// returns bit length of the integer x
function nbits(x) {
  var r = 1, t;
  if((t=x>>>16) != 0) { x = t; r += 16; }
  if((t=x>>8) != 0) { x = t; r += 8; }
  if((t=x>>4) != 0) { x = t; r += 4; }
  if((t=x>>2) != 0) { x = t; r += 2; }
  if((t=x>>1) != 0) { x = t; r += 1; }
  return r;
}

// (public) return the number of bits in "this"
function bnBitLength() {
  if(this.t <= 0) return 0;
  return this.DB*(this.t-1)+nbits(this[this.t-1]^(this.s&this.DM));
}

// (protected) r = this << n*DB
function bnpDLShiftTo(n,r) {
  var i;
  for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
  for(i = n-1; i >= 0; --i) r[i] = 0;
  r.t = this.t+n;
  r.s = this.s;
}

// (protected) r = this >> n*DB
function bnpDRShiftTo(n,r) {
  for(var i = n; i < this.t; ++i) r[i-n] = this[i];
  r.t = Math.max(this.t-n,0);
  r.s = this.s;
}

// (protected) r = this << n
function bnpLShiftTo(n,r) {
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<cbs)-1;
  var ds = Math.floor(n/this.DB), c = (this.s<<bs)&this.DM, i;
  for(i = this.t-1; i >= 0; --i) {
    r[i+ds+1] = (this[i]>>cbs)|c;
    c = (this[i]&bm)<<bs;
  }
  for(i = ds-1; i >= 0; --i) r[i] = 0;
  r[ds] = c;
  r.t = this.t+ds+1;
  r.s = this.s;
  r.clamp();
}

// (protected) r = this >> n
function bnpRShiftTo(n,r) {
  r.s = this.s;
  var ds = Math.floor(n/this.DB);
  if(ds >= this.t) { r.t = 0; return; }
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<bs)-1;
  r[0] = this[ds]>>bs;
  for(var i = ds+1; i < this.t; ++i) {
    r[i-ds-1] |= (this[i]&bm)<<cbs;
    r[i-ds] = this[i]>>bs;
  }
  if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
  r.t = this.t-ds;
  r.clamp();
}

// (protected) r = this - a
function bnpSubTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]-a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c -= a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c -= a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c -= a.s;
  }
  r.s = (c<0)?-1:0;
  if(c < -1) r[i++] = this.DV+c;
  else if(c > 0) r[i++] = c;
  r.t = i;
  r.clamp();
}

// (protected) r = this * a, r != this,a (HAC 14.12)
// "this" should be the larger one if appropriate.
function bnpMultiplyTo(a,r) {
  var x = this.abs(), y = a.abs();
  var i = x.t;
  r.t = i+y.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
  r.s = 0;
  r.clamp();
  if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
}

// (protected) r = this^2, r != this (HAC 14.16)
function bnpSquareTo(r) {
  var x = this.abs();
  var i = r.t = 2*x.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < x.t-1; ++i) {
    var c = x.am(i,x[i],r,2*i,0,1);
    if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= x.DV) {
      r[i+x.t] -= x.DV;
      r[i+x.t+1] = 1;
    }
  }
  if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
  r.s = 0;
  r.clamp();
}

// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
// r != q, this != m.  q or r may be null.
function bnpDivRemTo(m,q,r) {
  var pm = m.abs();
  if(pm.t <= 0) return;
  var pt = this.abs();
  if(pt.t < pm.t) {
    if(q != null) q.fromInt(0);
    if(r != null) this.copyTo(r);
    return;
  }
  if(r == null) r = nbi();
  var y = nbi(), ts = this.s, ms = m.s;
  var nsh = this.DB-nbits(pm[pm.t-1]);	// normalize modulus
  if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
  else { pm.copyTo(y); pt.copyTo(r); }
  var ys = y.t;
  var y0 = y[ys-1];
  if(y0 == 0) return;
  var yt = y0*(1<<this.F1)+((ys>1)?y[ys-2]>>this.F2:0);
  var d1 = this.FV/yt, d2 = (1<<this.F1)/yt, e = 1<<this.F2;
  var i = r.t, j = i-ys, t = (q==null)?nbi():q;
  y.dlShiftTo(j,t);
  if(r.compareTo(t) >= 0) {
    r[r.t++] = 1;
    r.subTo(t,r);
  }
  BigInteger.ONE.dlShiftTo(ys,t);
  t.subTo(y,y);	// "negative" y so we can replace sub with am later
  while(y.t < ys) y[y.t++] = 0;
  while(--j >= 0) {
    // Estimate quotient digit
    var qd = (r[--i]==y0)?this.DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
    if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
      y.dlShiftTo(j,t);
      r.subTo(t,r);
      while(r[i] < --qd) r.subTo(t,r);
    }
  }
  if(q != null) {
    r.drShiftTo(ys,q);
    if(ts != ms) BigInteger.ZERO.subTo(q,q);
  }
  r.t = ys;
  r.clamp();
  if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
  if(ts < 0) BigInteger.ZERO.subTo(r,r);
}

// (public) this mod a
function bnMod(a) {
  var r = nbi();
  this.abs().divRemTo(a,null,r);
  if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
  return r;
}

// Modular reduction using "classic" algorithm
function Classic(m) { this.m = m; }
function cConvert(x) {
  if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
  else return x;
}
function cRevert(x) { return x; }
function cReduce(x) { x.divRemTo(this.m,null,x); }
function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
// justification:
//         xy == 1 (mod m)
//         xy =  1+km
//   xy(2-xy) = (1+km)(1-km)
// x[y(2-xy)] = 1-k^2m^2
// x[y(2-xy)] == 1 (mod m^2)
// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
// JS multiply "overflows" differently from C/C++, so care is needed here.
function bnpInvDigit() {
  if(this.t < 1) return 0;
  var x = this[0];
  if((x&1) == 0) return 0;
  var y = x&3;		// y == 1/x mod 2^2
  y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
  y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
  y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
  // last step - calculate inverse mod DV directly;
  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
  y = (y*(2-x*y%this.DV))%this.DV;		// y == 1/x mod 2^dbits
  // we really want the negative inverse, and -DV < y < DV
  return (y>0)?this.DV-y:-y;
}

// Montgomery reduction
function Montgomery(m) {
  this.m = m;
  this.mp = m.invDigit();
  this.mpl = this.mp&0x7fff;
  this.mph = this.mp>>15;
  this.um = (1<<(m.DB-15))-1;
  this.mt2 = 2*m.t;
}

// xR mod m
function montConvert(x) {
  var r = nbi();
  x.abs().dlShiftTo(this.m.t,r);
  r.divRemTo(this.m,null,r);
  if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
  return r;
}

// x/R mod m
function montRevert(x) {
  var r = nbi();
  x.copyTo(r);
  this.reduce(r);
  return r;
}

// x = x/R mod m (HAC 14.32)
function montReduce(x) {
  while(x.t <= this.mt2)	// pad x so am has enough room later
    x[x.t++] = 0;
  for(var i = 0; i < this.m.t; ++i) {
    // faster way of calculating u0 = x[i]*mp mod DV
    var j = x[i]&0x7fff;
    var u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&x.DM;
    // use am to combine the multiply-shift-add into one call
    j = i+this.m.t;
    x[j] += this.m.am(0,u0,x,i,0,this.m.t);
    // propagate carry
    while(x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
  }
  x.clamp();
  x.drShiftTo(this.m.t,x);
  if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = "x^2/R mod m"; x != r
function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = "xy/R mod m"; x,y != r
function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

// (protected) true iff this is even
function bnpIsEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
function bnpExp(e,z) {
  if(e > 0xffffffff || e < 1) return BigInteger.ONE;
  var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
  g.copyTo(r);
  while(--i >= 0) {
    z.sqrTo(r,r2);
    if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
    else { var t = r; r = r2; r2 = t; }
  }
  return z.revert(r);
}

// (public) this^e % m, 0 <= e < 2^32
function bnModPowInt(e,m) {
  var z;
  if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
  return this.exp(e,z);
}

// protected
BigInteger.prototype.copyTo = bnpCopyTo;
BigInteger.prototype.fromInt = bnpFromInt;
BigInteger.prototype.fromString = bnpFromString;
BigInteger.prototype.clamp = bnpClamp;
BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
BigInteger.prototype.drShiftTo = bnpDRShiftTo;
BigInteger.prototype.lShiftTo = bnpLShiftTo;
BigInteger.prototype.rShiftTo = bnpRShiftTo;
BigInteger.prototype.subTo = bnpSubTo;
BigInteger.prototype.multiplyTo = bnpMultiplyTo;
BigInteger.prototype.squareTo = bnpSquareTo;
BigInteger.prototype.divRemTo = bnpDivRemTo;
BigInteger.prototype.invDigit = bnpInvDigit;
BigInteger.prototype.isEven = bnpIsEven;
BigInteger.prototype.exp = bnpExp;

// public
BigInteger.prototype.toString = bnToString;
BigInteger.prototype.negate = bnNegate;
BigInteger.prototype.abs = bnAbs;
BigInteger.prototype.compareTo = bnCompareTo;
BigInteger.prototype.bitLength = bnBitLength;
BigInteger.prototype.mod = bnMod;
BigInteger.prototype.modPowInt = bnModPowInt;

// "constants"
BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);

// Copyright (c) 2005-2009  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Extended JavaScript BN functions, required for RSA private ops.

// Version 1.1: new BigInteger("0", 10) returns "proper" zero
// Version 1.2: square() API, isProbablePrime fix

// (public)
function bnClone() { var r = nbi(); this.copyTo(r); return r; }

// (public) return value as integer
function bnIntValue() {
  if(this.s < 0) {
    if(this.t == 1) return this[0]-this.DV;
    else if(this.t == 0) return -1;
  }
  else if(this.t == 1) return this[0];
  else if(this.t == 0) return 0;
  // assumes 16 < DB < 32
  return ((this[1]&((1<<(32-this.DB))-1))<<this.DB)|this[0];
}

// (public) return value as byte
function bnByteValue() { return (this.t==0)?this.s:(this[0]<<24)>>24; }

// (public) return value as short (assumes DB>=16)
function bnShortValue() { return (this.t==0)?this.s:(this[0]<<16)>>16; }

// (protected) return x s.t. r^x < DV
function bnpChunkSize(r) { return Math.floor(Math.LN2*this.DB/Math.log(r)); }

// (public) 0 if this == 0, 1 if this > 0
function bnSigNum() {
  if(this.s < 0) return -1;
  else if(this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
  else return 1;
}

// (protected) convert to radix string
function bnpToRadix(b) {
  if(b == null) b = 10;
  if(this.signum() == 0 || b < 2 || b > 36) return "0";
  var cs = this.chunkSize(b);
  var a = Math.pow(b,cs);
  var d = nbv(a), y = nbi(), z = nbi(), r = "";
  this.divRemTo(d,y,z);
  while(y.signum() > 0) {
    r = (a+z.intValue()).toString(b).substr(1) + r;
    y.divRemTo(d,y,z);
  }
  return z.intValue().toString(b) + r;
}

// (protected) convert from radix string
function bnpFromRadix(s,b) {
  this.fromInt(0);
  if(b == null) b = 10;
  var cs = this.chunkSize(b);
  var d = Math.pow(b,cs), mi = false, j = 0, w = 0;
  for(var i = 0; i < s.length; ++i) {
    var x = intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
      continue;
    }
    w = b*w+x;
    if(++j >= cs) {
      this.dMultiply(d);
      this.dAddOffset(w,0);
      j = 0;
      w = 0;
    }
  }
  if(j > 0) {
    this.dMultiply(Math.pow(b,j));
    this.dAddOffset(w,0);
  }
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) alternate constructor
function bnpFromNumber(a,b,c) {
  if("number" == typeof b) {
    // new BigInteger(int,int,RNG)
    if(a < 2) this.fromInt(1);
    else {
      this.fromNumber(a,c);
      if(!this.testBit(a-1))	// force MSB set
        this.bitwiseTo(BigInteger.ONE.shiftLeft(a-1),op_or,this);
      if(this.isEven()) this.dAddOffset(1,0); // force odd
      while(!this.isProbablePrime(b)) {
        this.dAddOffset(2,0);
        if(this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a-1),this);
      }
    }
  }
  else {
    // new BigInteger(int,RNG)
    var x = new Array(), t = a&7;
    x.length = (a>>3)+1;
    b.nextBytes(x);
    if(t > 0) x[0] &= ((1<<t)-1); else x[0] = 0;
    this.fromString(x,256);
  }
}

// (public) convert to bigendian byte array
function bnToByteArray() {
  var i = this.t, r = new Array();
  r[0] = this.s;
  var p = this.DB-(i*this.DB)%8, d, k = 0;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) != (this.s&this.DM)>>p)
      r[k++] = d|(this.s<<(this.DB-p));
    while(i >= 0) {
      if(p < 8) {
        d = (this[i]&((1<<p)-1))<<(8-p);
        d |= this[--i]>>(p+=this.DB-8);
      }
      else {
        d = (this[i]>>(p-=8))&0xff;
        if(p <= 0) { p += this.DB; --i; }
      }
      if((d&0x80) != 0) d |= -256;
      if(k == 0 && (this.s&0x80) != (d&0x80)) ++k;
      if(k > 0 || d != this.s) r[k++] = d;
    }
  }
  return r;
}

function bnEquals(a) { return(this.compareTo(a)==0); }
function bnMin(a) { return(this.compareTo(a)<0)?this:a; }
function bnMax(a) { return(this.compareTo(a)>0)?this:a; }

// (protected) r = this op a (bitwise)
function bnpBitwiseTo(a,op,r) {
  var i, f, m = Math.min(a.t,this.t);
  for(i = 0; i < m; ++i) r[i] = op(this[i],a[i]);
  if(a.t < this.t) {
    f = a.s&this.DM;
    for(i = m; i < this.t; ++i) r[i] = op(this[i],f);
    r.t = this.t;
  }
  else {
    f = this.s&this.DM;
    for(i = m; i < a.t; ++i) r[i] = op(f,a[i]);
    r.t = a.t;
  }
  r.s = op(this.s,a.s);
  r.clamp();
}

// (public) this & a
function op_and(x,y) { return x&y; }
function bnAnd(a) { var r = nbi(); this.bitwiseTo(a,op_and,r); return r; }

// (public) this | a
function op_or(x,y) { return x|y; }
function bnOr(a) { var r = nbi(); this.bitwiseTo(a,op_or,r); return r; }

// (public) this ^ a
function op_xor(x,y) { return x^y; }
function bnXor(a) { var r = nbi(); this.bitwiseTo(a,op_xor,r); return r; }

// (public) this & ~a
function op_andnot(x,y) { return x&~y; }
function bnAndNot(a) { var r = nbi(); this.bitwiseTo(a,op_andnot,r); return r; }

// (public) ~this
function bnNot() {
  var r = nbi();
  for(var i = 0; i < this.t; ++i) r[i] = this.DM&~this[i];
  r.t = this.t;
  r.s = ~this.s;
  return r;
}

// (public) this << n
function bnShiftLeft(n) {
  var r = nbi();
  if(n < 0) this.rShiftTo(-n,r); else this.lShiftTo(n,r);
  return r;
}

// (public) this >> n
function bnShiftRight(n) {
  var r = nbi();
  if(n < 0) this.lShiftTo(-n,r); else this.rShiftTo(n,r);
  return r;
}

// return index of lowest 1-bit in x, x < 2^31
function lbit(x) {
  if(x == 0) return -1;
  var r = 0;
  if((x&0xffff) == 0) { x >>= 16; r += 16; }
  if((x&0xff) == 0) { x >>= 8; r += 8; }
  if((x&0xf) == 0) { x >>= 4; r += 4; }
  if((x&3) == 0) { x >>= 2; r += 2; }
  if((x&1) == 0) ++r;
  return r;
}

// (public) returns index of lowest 1-bit (or -1 if none)
function bnGetLowestSetBit() {
  for(var i = 0; i < this.t; ++i)
    if(this[i] != 0) return i*this.DB+lbit(this[i]);
  if(this.s < 0) return this.t*this.DB;
  return -1;
}

// return number of 1 bits in x
function cbit(x) {
  var r = 0;
  while(x != 0) { x &= x-1; ++r; }
  return r;
}

// (public) return number of set bits
function bnBitCount() {
  var r = 0, x = this.s&this.DM;
  for(var i = 0; i < this.t; ++i) r += cbit(this[i]^x);
  return r;
}

// (public) true iff nth bit is set
function bnTestBit(n) {
  var j = Math.floor(n/this.DB);
  if(j >= this.t) return(this.s!=0);
  return((this[j]&(1<<(n%this.DB)))!=0);
}

// (protected) this op (1<<n)
function bnpChangeBit(n,op) {
  var r = BigInteger.ONE.shiftLeft(n);
  this.bitwiseTo(r,op,r);
  return r;
}

// (public) this | (1<<n)
function bnSetBit(n) { return this.changeBit(n,op_or); }

// (public) this & ~(1<<n)
function bnClearBit(n) { return this.changeBit(n,op_andnot); }

// (public) this ^ (1<<n)
function bnFlipBit(n) { return this.changeBit(n,op_xor); }

// (protected) r = this + a
function bnpAddTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]+a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c += a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c += a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += a.s;
  }
  r.s = (c<0)?-1:0;
  if(c > 0) r[i++] = c;
  else if(c < -1) r[i++] = this.DV+c;
  r.t = i;
  r.clamp();
}

// (public) this + a
function bnAdd(a) { var r = nbi(); this.addTo(a,r); return r; }

// (public) this - a
function bnSubtract(a) { var r = nbi(); this.subTo(a,r); return r; }

// (public) this * a
function bnMultiply(a) { var r = nbi(); this.multiplyTo(a,r); return r; }

// (public) this^2
function bnSquare() { var r = nbi(); this.squareTo(r); return r; }

// (public) this / a
function bnDivide(a) { var r = nbi(); this.divRemTo(a,r,null); return r; }

// (public) this % a
function bnRemainder(a) { var r = nbi(); this.divRemTo(a,null,r); return r; }

// (public) [this/a,this%a]
function bnDivideAndRemainder(a) {
  var q = nbi(), r = nbi();
  this.divRemTo(a,q,r);
  return new Array(q,r);
}

// (protected) this *= n, this >= 0, 1 < n < DV
function bnpDMultiply(n) {
  this[this.t] = this.am(0,n-1,this,0,0,this.t);
  ++this.t;
  this.clamp();
}

// (protected) this += n << w words, this >= 0
function bnpDAddOffset(n,w) {
  if(n == 0) return;
  while(this.t <= w) this[this.t++] = 0;
  this[w] += n;
  while(this[w] >= this.DV) {
    this[w] -= this.DV;
    if(++w >= this.t) this[this.t++] = 0;
    ++this[w];
  }
}

// A "null" reducer
function NullExp() {}
function nNop(x) { return x; }
function nMulTo(x,y,r) { x.multiplyTo(y,r); }
function nSqrTo(x,r) { x.squareTo(r); }

NullExp.prototype.convert = nNop;
NullExp.prototype.revert = nNop;
NullExp.prototype.mulTo = nMulTo;
NullExp.prototype.sqrTo = nSqrTo;

// (public) this^e
function bnPow(e) { return this.exp(e,new NullExp()); }

// (protected) r = lower n words of "this * a", a.t <= n
// "this" should be the larger one if appropriate.
function bnpMultiplyLowerTo(a,n,r) {
  var i = Math.min(this.t+a.t,n);
  r.s = 0; // assumes a,this >= 0
  r.t = i;
  while(i > 0) r[--i] = 0;
  var j;
  for(j = r.t-this.t; i < j; ++i) r[i+this.t] = this.am(0,a[i],r,i,0,this.t);
  for(j = Math.min(a.t,n); i < j; ++i) this.am(0,a[i],r,i,0,n-i);
  r.clamp();
}

// (protected) r = "this * a" without lower n words, n > 0
// "this" should be the larger one if appropriate.
function bnpMultiplyUpperTo(a,n,r) {
  --n;
  var i = r.t = this.t+a.t-n;
  r.s = 0; // assumes a,this >= 0
  while(--i >= 0) r[i] = 0;
  for(i = Math.max(n-this.t,0); i < a.t; ++i)
    r[this.t+i-n] = this.am(n-i,a[i],r,0,0,this.t+i-n);
  r.clamp();
  r.drShiftTo(1,r);
}

// Barrett modular reduction
function Barrett(m) {
  // setup Barrett
  this.r2 = nbi();
  this.q3 = nbi();
  BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
  this.mu = this.r2.divide(m);
  this.m = m;
}

function barrettConvert(x) {
  if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
  else if(x.compareTo(this.m) < 0) return x;
  else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
}

function barrettRevert(x) { return x; }

// x = x mod m (HAC 14.42)
function barrettReduce(x) {
  x.drShiftTo(this.m.t-1,this.r2);
  if(x.t > this.m.t+1) { x.t = this.m.t+1; x.clamp(); }
  this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
  this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
  while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
  x.subTo(this.r2,x);
  while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = x^2 mod m; x != r
function barrettSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = x*y mod m; x,y != r
function barrettMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Barrett.prototype.convert = barrettConvert;
Barrett.prototype.revert = barrettRevert;
Barrett.prototype.reduce = barrettReduce;
Barrett.prototype.mulTo = barrettMulTo;
Barrett.prototype.sqrTo = barrettSqrTo;

// (public) this^e % m (HAC 14.85)
function bnModPow(e,m) {
  var i = e.bitLength(), k, r = nbv(1), z;
  if(i <= 0) return r;
  else if(i < 18) k = 1;
  else if(i < 48) k = 3;
  else if(i < 144) k = 4;
  else if(i < 768) k = 5;
  else k = 6;
  if(i < 8)
    z = new Classic(m);
  else if(m.isEven())
    z = new Barrett(m);
  else
    z = new Montgomery(m);

  // precomputation
  var g = new Array(), n = 3, k1 = k-1, km = (1<<k)-1;
  g[1] = z.convert(this);
  if(k > 1) {
    var g2 = nbi();
    z.sqrTo(g[1],g2);
    while(n <= km) {
      g[n] = nbi();
      z.mulTo(g2,g[n-2],g[n]);
      n += 2;
    }
  }

  var j = e.t-1, w, is1 = true, r2 = nbi(), t;
  i = nbits(e[j])-1;
  while(j >= 0) {
    if(i >= k1) w = (e[j]>>(i-k1))&km;
    else {
      w = (e[j]&((1<<(i+1))-1))<<(k1-i);
      if(j > 0) w |= e[j-1]>>(this.DB+i-k1);
    }

    n = k;
    while((w&1) == 0) { w >>= 1; --n; }
    if((i -= n) < 0) { i += this.DB; --j; }
    if(is1) {	// ret == 1, don't bother squaring or multiplying it
      g[w].copyTo(r);
      is1 = false;
    }
    else {
      while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
      if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
      z.mulTo(r2,g[w],r);
    }

    while(j >= 0 && (e[j]&(1<<i)) == 0) {
      z.sqrTo(r,r2); t = r; r = r2; r2 = t;
      if(--i < 0) { i = this.DB-1; --j; }
    }
  }
  return z.revert(r);
}

// (public) gcd(this,a) (HAC 14.54)
function bnGCD(a) {
  var x = (this.s<0)?this.negate():this.clone();
  var y = (a.s<0)?a.negate():a.clone();
  if(x.compareTo(y) < 0) { var t = x; x = y; y = t; }
  var i = x.getLowestSetBit(), g = y.getLowestSetBit();
  if(g < 0) return x;
  if(i < g) g = i;
  if(g > 0) {
    x.rShiftTo(g,x);
    y.rShiftTo(g,y);
  }
  while(x.signum() > 0) {
    if((i = x.getLowestSetBit()) > 0) x.rShiftTo(i,x);
    if((i = y.getLowestSetBit()) > 0) y.rShiftTo(i,y);
    if(x.compareTo(y) >= 0) {
      x.subTo(y,x);
      x.rShiftTo(1,x);
    }
    else {
      y.subTo(x,y);
      y.rShiftTo(1,y);
    }
  }
  if(g > 0) y.lShiftTo(g,y);
  return y;
}

// (protected) this % n, n < 2^26
function bnpModInt(n) {
  if(n <= 0) return 0;
  var d = this.DV%n, r = (this.s<0)?n-1:0;
  if(this.t > 0)
    if(d == 0) r = this[0]%n;
    else for(var i = this.t-1; i >= 0; --i) r = (d*r+this[i])%n;
  return r;
}

// (public) 1/this % m (HAC 14.61)
function bnModInverse(m) {
  var ac = m.isEven();
  if((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
  var u = m.clone(), v = this.clone();
  var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
  while(u.signum() != 0) {
    while(u.isEven()) {
      u.rShiftTo(1,u);
      if(ac) {
        if(!a.isEven() || !b.isEven()) { a.addTo(this,a); b.subTo(m,b); }
        a.rShiftTo(1,a);
      }
      else if(!b.isEven()) b.subTo(m,b);
      b.rShiftTo(1,b);
    }
    while(v.isEven()) {
      v.rShiftTo(1,v);
      if(ac) {
        if(!c.isEven() || !d.isEven()) { c.addTo(this,c); d.subTo(m,d); }
        c.rShiftTo(1,c);
      }
      else if(!d.isEven()) d.subTo(m,d);
      d.rShiftTo(1,d);
    }
    if(u.compareTo(v) >= 0) {
      u.subTo(v,u);
      if(ac) a.subTo(c,a);
      b.subTo(d,b);
    }
    else {
      v.subTo(u,v);
      if(ac) c.subTo(a,c);
      d.subTo(b,d);
    }
  }
  if(v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
  if(d.compareTo(m) >= 0) return d.subtract(m);
  if(d.signum() < 0) d.addTo(m,d); else return d;
  if(d.signum() < 0) return d.add(m); else return d;
}

var lowprimes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997];
var lplim = (1<<26)/lowprimes[lowprimes.length-1];

// (public) test primality with certainty >= 1-.5^t
function bnIsProbablePrime(t) {
  var i, x = this.abs();
  if(x.t == 1 && x[0] <= lowprimes[lowprimes.length-1]) {
    for(i = 0; i < lowprimes.length; ++i)
      if(x[0] == lowprimes[i]) return true;
    return false;
  }
  if(x.isEven()) return false;
  i = 1;
  while(i < lowprimes.length) {
    var m = lowprimes[i], j = i+1;
    while(j < lowprimes.length && m < lplim) m *= lowprimes[j++];
    m = x.modInt(m);
    while(i < j) if(m%lowprimes[i++] == 0) return false;
  }
  return x.millerRabin(t);
}

// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
function bnpMillerRabin(t) {
  var n1 = this.subtract(BigInteger.ONE);
  var k = n1.getLowestSetBit();
  if(k <= 0) return false;
  var r = n1.shiftRight(k);
  t = (t+1)>>1;
  if(t > lowprimes.length) t = lowprimes.length;
  var a = nbi();
  for(var i = 0; i < t; ++i) {
    //Pick bases at random, instead of starting at 2
    a.fromInt(lowprimes[Math.floor(Math.random()*lowprimes.length)]);
    var y = a.modPow(r,this);
    if(y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
      var j = 1;
      while(j++ < k && y.compareTo(n1) != 0) {
        y = y.modPowInt(2,this);
        if(y.compareTo(BigInteger.ONE) == 0) return false;
      }
      if(y.compareTo(n1) != 0) return false;
    }
  }
  return true;
}

// protected
BigInteger.prototype.chunkSize = bnpChunkSize;
BigInteger.prototype.toRadix = bnpToRadix;
BigInteger.prototype.fromRadix = bnpFromRadix;
BigInteger.prototype.fromNumber = bnpFromNumber;
BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
BigInteger.prototype.changeBit = bnpChangeBit;
BigInteger.prototype.addTo = bnpAddTo;
BigInteger.prototype.dMultiply = bnpDMultiply;
BigInteger.prototype.dAddOffset = bnpDAddOffset;
BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
BigInteger.prototype.modInt = bnpModInt;
BigInteger.prototype.millerRabin = bnpMillerRabin;

// public
BigInteger.prototype.clone = bnClone;
BigInteger.prototype.intValue = bnIntValue;
BigInteger.prototype.byteValue = bnByteValue;
BigInteger.prototype.shortValue = bnShortValue;
BigInteger.prototype.signum = bnSigNum;
BigInteger.prototype.toByteArray = bnToByteArray;
BigInteger.prototype.equals = bnEquals;
BigInteger.prototype.min = bnMin;
BigInteger.prototype.max = bnMax;
BigInteger.prototype.and = bnAnd;
BigInteger.prototype.or = bnOr;
BigInteger.prototype.xor = bnXor;
BigInteger.prototype.andNot = bnAndNot;
BigInteger.prototype.not = bnNot;
BigInteger.prototype.shiftLeft = bnShiftLeft;
BigInteger.prototype.shiftRight = bnShiftRight;
BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
BigInteger.prototype.bitCount = bnBitCount;
BigInteger.prototype.testBit = bnTestBit;
BigInteger.prototype.setBit = bnSetBit;
BigInteger.prototype.clearBit = bnClearBit;
BigInteger.prototype.flipBit = bnFlipBit;
BigInteger.prototype.add = bnAdd;
BigInteger.prototype.subtract = bnSubtract;
BigInteger.prototype.multiply = bnMultiply;
BigInteger.prototype.divide = bnDivide;
BigInteger.prototype.remainder = bnRemainder;
BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
BigInteger.prototype.modPow = bnModPow;
BigInteger.prototype.modInverse = bnModInverse;
BigInteger.prototype.pow = bnPow;
BigInteger.prototype.gcd = bnGCD;
BigInteger.prototype.isProbablePrime = bnIsProbablePrime;

// JSBN-specific extension
BigInteger.prototype.square = bnSquare;

// BigInteger interfaces not implemented in jsbn:

// BigInteger(int signum, byte[] magnitude)
// double doubleValue()
// float floatValue()
// int hashCode()
// long longValue()
//
BigInteger.prototype.lesser = function(rhs) {
  return this.compareTo(rhs) < 0
}
BigInteger.prototype.lesserOrEquals = function(rhs) {
  return this.compareTo(rhs) <= 0
}
BigInteger.prototype.greater = function(rhs) {
  return this.compareTo(rhs) > 0
}
BigInteger.prototype.greaterOrEquals = function(rhs) {
  return this.compareTo(rhs) >= 0
}

return function(val) {
  return new BigInteger(val);
}
})();

var i$ZERO = i$bigInt("0");
var i$ONE = i$bigInt("1");
/** @constructor */
var i$VM = function() {
  this.valstack = {};
  this.valstack_top = 0;
  this.valstack_base = 0;

  this.ret = null;

  this.callstack = [];
}

var i$vm;
var i$valstack;
var i$valstack_top;
var i$valstack_base;
var i$ret;
var i$callstack;

var i$Int = {};
var i$String = {};
var i$Integer = {};
var i$Float = {};
var i$Char = {};
var i$Ptr = {};
var i$Forgot = {};

/** @constructor */
var i$CON = function(tag,args,app,ev) {
  this.tag = tag;
  this.args = args;
  this.app = app;
  this.ev = ev;
}

/** @constructor */
var i$POINTER = function(addr) {
  this.addr = addr;
}

var i$SCHED = function(vm) {
  i$vm = vm;
  i$valstack = vm.valstack;
  i$valstack_top = vm.valstack_top;
  i$valstack_base = vm.valstack_base;
  i$ret = vm.ret;
  i$callstack = vm.callstack;
}

var i$SLIDE = function(args) {
  for (var i = 0; i < args; ++i)
    i$valstack[i$valstack_base + i] = i$valstack[i$valstack_top + i];
}

var i$PROJECT = function(val,loc,arity) {
  for (var i = 0; i < arity; ++i)
    i$valstack[i$valstack_base + i + loc] = val.args[i];
}

var i$CALL = function(fun,args) {
  i$callstack.push(args);
  i$callstack.push(fun);
}

var i$ffiWrap = function(fid,oldbase,myoldbase) {
  return function() {
    var oldstack = i$callstack;
    i$callstack = [];

    var res = fid;

    for(var i = 0; i < (arguments.length ? arguments.length : 1); ++i) {
      while (res instanceof i$CON) {
        i$valstack_top += 1;
        i$valstack[i$valstack_top] = res;
        i$valstack[i$valstack_top + 1] = arguments[i];
        i$SLIDE(2);
        i$valstack_top = i$valstack_base + 2;
        i$CALL(_idris__123_APPLY0_125_,[oldbase])
        while (i$callstack.length) {
          var func = i$callstack.pop();
          var args = i$callstack.pop();
          func.apply(this,args);
        }
        res = i$ret;
      }
    }

    i$callstack = oldstack;

    return i$ret;
  }
}

var i$charCode = function(str) {
  if (typeof str == "string")
    return str.charCodeAt(0);
  else
    return str;
}

var i$fromCharCode = function(chr) {
  if (typeof chr == "string")
    return chr;
  else
    return String.fromCharCode(chr);
}

var i$RUN = function () {
  for (var i = 0; i < 10000 && i$callstack.length; i++) {
    var func = i$callstack.pop();
    var args = i$callstack.pop();
    func.apply(this,args);
  };

  if (i$callstack.length)
    setTimeout(i$RUN, 0);
}
var i$getLine = function() {
    return prompt("Prelude.getLine");
}

var i$putStr = function(s) {
  console.log(s);
};

var i$systemInfo = function(index) {
  switch(index) {
    case 0:
      return "javascript";
    case 1:
      return navigator.platform;
  }
  return "";
}
var _idris_Prelude_46_Basics_46__46_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 6] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Prelude_46_Basics_46__46_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Basics_46__46_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_PE_95_map_95_622baa6c = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 3];
  i$SLIDE(5);
  i$valstack_top = i$valstack_base + 5;
  i$CALL(_idris_Prelude_46_Functor_46_Prelude_46_Monad_46__64_Prelude_46_Functor_46_Functor_36_IO_39__32_ffi_58__33_map_58_0,[oldbase]);
}
var _idris_Main_46_app$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 2] = new i$CON(3,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(65691,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65691,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46_app = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2]],null,null);
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = "Enter a name?";
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46_app$0,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_StdIO_46_putStr,[myoldbase]);
}
var _idris_call_95__95_IO = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Prelude_46_Chars_46_chr$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$ret = "\u0000";
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$ret = i$fromCharCode(i$valstack[i$valstack_base]);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Chars_46_chr$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
}
var _idris_Prelude_46_Chars_46_chr$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  i$CALL(_idris_Prelude_46_Chars_46_chr$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_base + 1] = i$CON$0;
      break;
    case 1:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Chars_46_chr$2,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46__123_chr_95_0_125_,[myoldbase]);
      break;
  };
}
var _idris_Prelude_46_Chars_46_chr = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = 0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Chars_46_chr$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0,[myoldbase]);
}
var _idris_Effects_46_dropEnv$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 15] = i$ret;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 12],i$valstack[i$valstack_base + 13],i$valstack[i$valstack_base + 15]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_dropEnv$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 11] = i$ret;
  i$PROJECT(i$valstack[i$valstack_base + 11],12,3);
  i$valstack[i$valstack_base + 15] = undefined;
  i$valstack[i$valstack_base + 16] = undefined;
  i$valstack[i$valstack_base + 17] = undefined;
  ;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 15];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 16];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 17];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 5;
  i$CALL(_idris_Effects_46_dropEnv$1,[oldbase,myoldbase]);
  i$CALL(_idris_Effects_46_dropEnv,[myoldbase]);
}
var _idris_Effects_46_dropEnv = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 13;
  switch(i$valstack[i$valstack_base + 4].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 4],5,2);
      switch(i$valstack[i$valstack_base + 3].tag){
        case 1:
          i$PROJECT(i$valstack[i$valstack_base + 3],7,3);
          i$valstack[i$valstack_base + 10] = new i$CON(1,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9]],null,null);
          i$valstack[i$valstack_base + 11] = undefined;
          i$valstack[i$valstack_base + 12] = undefined;
          i$valstack[i$valstack_base + 13] = undefined;
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 11];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 12];
          i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 13];
          i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
          i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 10];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 5;
          i$CALL(_idris_Effects_46_dropEnv$0,[oldbase,myoldbase]);
          i$CALL(_idris_Effects_46_envElem,[myoldbase]);
          break;
        case 0:
          i$ret = undefined;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
    case 0:
      switch(i$valstack[i$valstack_base + 3].tag){
        case 1:
          i$PROJECT(i$valstack[i$valstack_base + 3],5,3);
          i$ret = i$CON$0;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
        case 0:
          i$ret = i$CON$0;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
  };
}
var _idris_Effects_46_eff$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 14] = i$ret;
  i$valstack[i$valstack_base + 15] = new i$CON(65670,[i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65670,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 11];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 12];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 13];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 15];
  i$SLIDE(8);
  i$valstack_top = i$valstack_base + 8;
  i$CALL(_idris_Effects_46_eff,[oldbase]);
}
var _idris_Effects_46_eff$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 15] = i$ret;
  i$valstack[i$valstack_base + 16] = new i$CON(65674,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 5]],_idris__123_APPLY_95_0_125_$65674,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 11];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 12];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 13];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 15];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 16];
  i$SLIDE(8);
  i$valstack_top = i$valstack_base + 8;
  i$CALL(_idris_Effects_46_eff,[oldbase]);
}
var _idris_Effects_46_eff$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 9] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46_eff = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 10;
  switch(i$valstack[i$valstack_base + 6].tag){
    case 5:
      i$valstack[i$valstack_base + 8] = i$valstack[i$valstack_base + 6].args[0];
      i$valstack[i$valstack_base + 9] = undefined;
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_base + 12] = undefined;
      i$valstack[i$valstack_base + 13] = undefined;
      i$valstack[i$valstack_base + 14] = undefined;
      i$valstack[i$valstack_base + 15] = undefined;
      i$valstack[i$valstack_base + 16] = undefined;
      i$valstack[i$valstack_base + 17] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 14];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 15];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 16];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 17];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 5];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 5;
      i$CALL(_idris_Effects_46_eff$0,[oldbase,myoldbase]);
      i$CALL(_idris_Effects_46_unlabel,[myoldbase]);
      break;
    case 2:
      i$PROJECT(i$valstack[i$valstack_base + 6],8,2);
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_base + 12] = undefined;
      i$valstack[i$valstack_base + 13] = undefined;
      i$valstack[i$valstack_base + 14] = undefined;
      i$valstack[i$valstack_base + 15] = undefined;
      i$valstack[i$valstack_base + 16] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 12];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 13];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 14];
      i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 15];
      i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 16];
      i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 5];
      i$valstack[i$valstack_top + 8] = i$valstack[i$valstack_base + 8];
      i$valstack[i$valstack_top + 9] = i$valstack[i$valstack_base + 9];
      i$valstack[i$valstack_top + 10] = i$valstack[i$valstack_base + 7];
      i$SLIDE(11);
      i$valstack_top = i$valstack_base + 11;
      i$CALL(_idris_Effects_46_execEff,[oldbase]);
      break;
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 6],8,2);
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_base + 12] = undefined;
      i$valstack[i$valstack_base + 13] = undefined;
      i$valstack[i$valstack_base + 14] = undefined;
      i$valstack[i$valstack_base + 15] = new i$CON(65672,[i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65672,null);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 12];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 13];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 14];
      i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 5];
      i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 8];
      i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 15];
      i$SLIDE(8);
      i$valstack_top = i$valstack_base + 8;
      i$CALL(_idris_Effects_46_eff,[oldbase]);
      break;
    case 3:
      i$PROJECT(i$valstack[i$valstack_base + 6],8,2);
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_base + 12] = undefined;
      i$valstack[i$valstack_base + 13] = undefined;
      i$valstack[i$valstack_base + 14] = undefined;
      i$valstack[i$valstack_base + 15] = undefined;
      i$valstack[i$valstack_base + 16] = undefined;
      i$valstack[i$valstack_base + 17] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 15];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 16];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 17];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 8];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 5;
      i$CALL(_idris_Effects_46_eff$1,[oldbase,myoldbase]);
      i$CALL(_idris_Effects_46_dropEnv,[myoldbase]);
      break;
    case 4:
      i$PROJECT(i$valstack[i$valstack_base + 6],8,3);
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_base + 12] = undefined;
      i$valstack[i$valstack_base + 13] = undefined;
      i$valstack[i$valstack_base + 14] = undefined;
      i$valstack[i$valstack_base + 15] = undefined;
      i$valstack[i$valstack_base + 16] = new i$CON(1,[i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 5]],null,null);
      i$valstack[i$valstack_base + 17] = new i$CON(65675,[i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65675,null);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 12];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 13];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 14];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 15];
      i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 16];
      i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 17];
      i$SLIDE(8);
      i$valstack_top = i$valstack_base + 8;
      i$CALL(_idris_Effects_46_eff,[oldbase]);
      break;
    case 0:
      i$valstack[i$valstack_base + 8] = i$valstack[i$valstack_base + 6].args[0];
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 8];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Effects_46_eff$2,[oldbase,myoldbase]);
      i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
      break;
  };
}
var _idris_Effects_46_envElem = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 7;
  switch(i$valstack[i$valstack_base + 3].tag){
    case 1:
      i$valstack[i$valstack_base + 5] = i$valstack[i$valstack_base + 3].args[0];
      i$PROJECT(i$valstack[i$valstack_base + 4],6,3);
      i$valstack[i$valstack_base + 9] = undefined;
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      ;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 8];
      i$SLIDE(5);
      i$valstack_top = i$valstack_base + 5;
      i$CALL(_idris_Effects_46_envElem,[oldbase]);
      break;
    case 0:
      i$PROJECT(i$valstack[i$valstack_base + 4],5,3);
      i$valstack[i$valstack_base + 8] = i$CON$0;
      i$ret = new i$CON(1,[i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 8]],null,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Effects_46_execEff$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 14] = i$ret;
  i$valstack[i$valstack_base + 15] = new i$CON(65677,[i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 11],i$valstack[i$valstack_base + 13]],_idris__123_APPLY_95_0_125_$65677,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 15];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46_execEff$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 14] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 9];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46_execEff$2,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46_execEff$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 14] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 12];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46_execEff$1,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46_execEff = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 12;
  switch(i$valstack[i$valstack_base + 8].tag){
    case 0:
      i$PROJECT(i$valstack[i$valstack_base + 7],11,3);
      i$valstack[i$valstack_base + 14] = undefined;
      i$valstack[i$valstack_base + 15] = undefined;
      i$valstack[i$valstack_base + 16] = undefined;
      i$valstack[i$valstack_base + 17] = undefined;
      i$valstack[i$valstack_base + 18] = undefined;
      i$valstack[i$valstack_base + 19] = undefined;
      ;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 14];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 15];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 16];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 17];
      i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 18];
      i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 19];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 7;
      i$CALL(_idris_Effects_46_execEff$0,[oldbase,myoldbase]);
      i$CALL(_idris_Effects_46_handle,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 11] = i$valstack[i$valstack_base + 8].args[0];
      i$PROJECT(i$valstack[i$valstack_base + 7],12,3);
      i$valstack[i$valstack_base + 15] = undefined;
      i$valstack[i$valstack_base + 16] = undefined;
      i$valstack[i$valstack_base + 17] = undefined;
      i$valstack[i$valstack_base + 18] = undefined;
      i$valstack[i$valstack_base + 19] = undefined;
      i$valstack[i$valstack_base + 20] = undefined;
      i$valstack[i$valstack_base + 21] = undefined;
      i$valstack[i$valstack_base + 22] = new i$CON(65679,[i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 12],i$valstack[i$valstack_base + 13]],_idris__123_APPLY_95_0_125_$65679,null);
      ;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 15];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 16];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 17];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 18];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 19];
      i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 20];
      i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 21];
      i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 14];
      i$valstack[i$valstack_top + 8] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 9] = i$valstack[i$valstack_base + 9];
      i$valstack[i$valstack_top + 10] = i$valstack[i$valstack_base + 22];
      i$SLIDE(11);
      i$valstack_top = i$valstack_base + 11;
      i$CALL(_idris_Effects_46_execEff,[oldbase]);
      break;
  };
}
var _idris_Effect_46_State_46_get = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$ret = new i$CON(2,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Interactive_46_getChar = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_base] = undefined;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_base + 2] = i$CON$65713;
  i$valstack[i$valstack_base + 3] = i$CON$65714;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 3];
  i$SLIDE(4);
  i$valstack_top = i$valstack_base + 4;
  i$CALL(_idris_PE_95_map_95_622baa6c,[oldbase]);
}
var _idris_Prelude_46_Interactive_46_getLine_39_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = i$CON$65715;
  i$valstack[i$valstack_base + 5] = i$CON$65716;
  i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5]],_idris__123_APPLY_95_0_125_$65733,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effect_46_StdIO_46_getStr = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 1] = i$CON$0;
  i$valstack[i$valstack_base + 2] = i$CON$1;
  i$ret = new i$CON(2,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_handle$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46_handle$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46_handle$2,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46_handle$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46_handle$1,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46_handle = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46_handle$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Basics_46_id = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$valstack[i$valstack_base + 1];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_io_95_bind$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 7];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_io_95_bind$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 6] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_io_95_bind$1,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_io_95_bind = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 6;
  i$CALL(_idris_io_95_bind$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_io_95_bind_95_2_125_,[myoldbase]);
}
var _idris_io_95_pure = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$valstack[i$valstack_base + 2];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Chars_46_isDigit$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
      i$valstack_top = i$valstack_base + 1;
      i$CALL(_idris_Prelude_46_Chars_46__123_isDigit_95_0_125_,[oldbase]);
      break;
  };
}
var _idris_Prelude_46_Chars_46_isDigit = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "0";
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Chars_46_isDigit$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0,[myoldbase]);
}
var _idris_Prelude_46_Chars_46_isSpace$5 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
      i$valstack_top = i$valstack_base + 1;
      i$CALL(_idris_Prelude_46_Chars_46__123_isSpace_95_0_125_,[oldbase]);
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Chars_46_isSpace$6 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
}
var _idris_Prelude_46_Chars_46_isSpace$4 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Chars_46_isSpace$5,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Chars_46_isSpace$6,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46__123_isSpace_95_1_125_,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 1] = i$CON$1;
      break;
  };
}
var _idris_Prelude_46_Chars_46_isSpace$7 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
}
var _idris_Prelude_46_Chars_46_isSpace$3 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Chars_46_isSpace$4,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Chars_46_isSpace$7,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46__123_isSpace_95_2_125_,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 1] = i$CON$1;
      break;
  };
}
var _idris_Prelude_46_Chars_46_isSpace$8 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
}
var _idris_Prelude_46_Chars_46_isSpace$2 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Chars_46_isSpace$3,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Chars_46_isSpace$8,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46__123_isSpace_95_3_125_,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 1] = i$CON$1;
      break;
  };
}
var _idris_Prelude_46_Chars_46_isSpace$9 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
}
var _idris_Prelude_46_Chars_46_isSpace$1 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Chars_46_isSpace$2,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Chars_46_isSpace$9,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46__123_isSpace_95_4_125_,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 1] = i$CON$1;
      break;
  };
}
var _idris_Prelude_46_Chars_46_isSpace$10 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
}
var _idris_Prelude_46_Chars_46_isSpace$0 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Chars_46_isSpace$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Chars_46_isSpace$10,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46__123_isSpace_95_5_125_,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 1] = i$CON$1;
      break;
  };
}
var _idris_Prelude_46_Chars_46_isSpace = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = " ";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  i$CALL(_idris_Prelude_46_Chars_46_isSpace$0,[oldbase,myoldbase]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$valstack[i$valstack_base + 1] = i$CON$0;
  } else {
    i$valstack[i$valstack_base + 1] = i$CON$1;
  };
}
var _idris_Prelude_46_List_46_length$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$ret = i$valstack[i$valstack_base + 4].add(i$valstack[i$valstack_base + 5]);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_List_46_length = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 1],2,2);
      i$valstack[i$valstack_base + 4] = i$ONE;
      i$valstack[i$valstack_base + 5] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Prelude_46_List_46_length$0,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_List_46_length,[myoldbase]);
      break;
    case 0:
      i$ret = i$ZERO;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Strings_46_ltrim$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  switch(i$valstack[i$valstack_base + 4].tag){
    case 0:
      i$ret = i$valstack[i$valstack_base + 2].concat(i$valstack[i$valstack_base + 3]);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
      i$valstack_top = i$valstack_base + 1;
      i$CALL(_idris_Prelude_46_Strings_46_ltrim,[oldbase]);
      break;
  };
}
var _idris_Prelude_46_Strings_46_ltrim$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 1],2,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Strings_46_ltrim$1,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46_isSpace,[myoldbase]);
      break;
    case 0:
      i$ret = "";
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Strings_46_ltrim = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Strings_46_ltrim$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Main_46_main$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_base + 6] = i$CON$65706;
  i$valstack[i$valstack_base + 7] = i$CON$0;
  i$valstack[i$valstack_base + 8] = i$CON$65698;
  i$valstack[i$valstack_base + 9] = i$CON$0;
  i$valstack[i$valstack_base + 10] = i$CON$0;
  i$valstack[i$valstack_base + 8] = new i$CON(1,[i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10]],null,null);
  i$valstack[i$valstack_base + 6] = new i$CON(1,[i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8]],null,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 6];
  i$SLIDE(7);
  i$valstack_top = i$valstack_base + 7;
  i$CALL(_idris_Effects_46_run,[oldbase]);
}
var _idris_Main_46_main = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 11;
  i$valstack[i$valstack_base] = undefined;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = i$CON$65699;
  i$valstack[i$valstack_base + 5] = 3;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46_main$0,[oldbase,myoldbase]);
  i$CALL(_idris_Main_46_app,[myoldbase]);
}
var _idris_Prelude_46_Show_46_precCon = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  switch(i$valstack[i$valstack_base].tag){
    case 6:
      i$ret = i$bigInt("6");
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 3:
      i$ret = i$bigInt("3");
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 2:
      i$ret = i$bigInt("2");
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$ret = i$ONE;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 0:
      i$ret = i$ZERO;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 5:
      i$ret = i$bigInt("5");
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 4:
      i$valstack[i$valstack_base + 1] = i$valstack[i$valstack_base].args[0];
      i$ret = i$bigInt("4");
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Show_46_primNumShow$2 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 5].tag){
    case 0:
      i$ret = i$valstack[i$valstack_base + 4];
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$valstack[i$valstack_base + 6] = "(";
      i$valstack[i$valstack_base + 7] = ")";
      i$valstack[i$valstack_base + 7] = i$valstack[i$valstack_base + 4] + i$valstack[i$valstack_base + 7];
      i$ret = i$valstack[i$valstack_base + 6] + i$valstack[i$valstack_base + 7];
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Show_46_primNumShow$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
}
var _idris_Prelude_46_Show_46_primNumShow$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$CALL(_idris_Prelude_46_Show_46_primNumShow$2,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 5].tag){
    case 0:
      i$valstack[i$valstack_base + 5] = i$CON$0;
      break;
    case 1:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 2];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 5;
      i$CALL(_idris_Prelude_46_Show_46_primNumShow$3,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Show_46__123_primNumShow_95_2_125_,[myoldbase]);
      break;
  };
}
var _idris_Prelude_46_Show_46_primNumShow$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_base + 5] = i$CON$5;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Show_46_primNumShow$1,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0,[myoldbase]);
}
var _idris_Prelude_46_Show_46_primNumShow = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Show_46_primNumShow$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_prim_95__95_strCons = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$valstack[i$valstack_base].concat(i$valstack[i$valstack_base + 1]);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_prim_95__95_toStrInt = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = String(i$valstack[i$valstack_base]);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_prim_95_write = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$putStr(i$valstack[i$valstack_base + 1]);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_protectEsc$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base + 3] + i$valstack[i$valstack_base + 2];
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base + 3];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_protectEsc$1 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Show_46_protectEsc$2,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 3].tag){
    case 0:
      i$valstack[i$valstack_base + 3] = "";
      break;
    case 1:
      i$valstack[i$valstack_base + 3] = "\\&";
      break;
  };
}
var _idris_Prelude_46_Show_46_protectEsc$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
}
var _idris_Prelude_46_Show_46_protectEsc$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$CALL(_idris_Prelude_46_Show_46_protectEsc$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 3].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 3],4,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Prelude_46_Show_46_protectEsc$3,[oldbase,myoldbase]);
      i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
      break;
    case 0:
      i$valstack[i$valstack_base + 3] = i$CON$0;
      break;
  };
}
var _idris_Prelude_46_Show_46_protectEsc = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Show_46_protectEsc$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Prelude_46_Applicative_46_pure = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effect_46_State_46_put = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 4] = new i$CON(1,[i$valstack[i$valstack_base + 1]],null,null);
  i$ret = new i$CON(2,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Interactive_46_putChar = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 2] = i$charCode(i$valstack[i$valstack_base]);
  i$ret = putchar;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effect_46_StdIO_46_putStr = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_base + 3] = new i$CON(0,[i$valstack[i$valstack_base]],null,null);
  i$ret = new i$CON(2,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Interactive_46_putStr_39_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 5] = new i$CON(65737,[i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65737,null);
  i$valstack[i$valstack_base + 6] = i$CON$65717;
  i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65733,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_rebuildEnv$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 18] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 12];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 13];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 15];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 16];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 17];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 8] = i$valstack[i$valstack_base + 18];
  i$SLIDE(9);
  i$valstack_top = i$valstack_base + 9;
  i$CALL(_idris_Effects_46_replaceEnvAt,[oldbase]);
}
var _idris_Effects_46_rebuildEnv = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 15;
  switch(i$valstack[i$valstack_base + 5].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 5],7,2);
      switch(i$valstack[i$valstack_base + 4].tag){
        case 1:
          i$PROJECT(i$valstack[i$valstack_base + 4],9,3);
          i$valstack[i$valstack_base + 12] = undefined;
          i$valstack[i$valstack_base + 13] = undefined;
          i$valstack[i$valstack_base + 14] = undefined;
          i$valstack[i$valstack_base + 15] = undefined;
          i$valstack[i$valstack_base + 16] = undefined;
          i$valstack[i$valstack_base + 17] = undefined;
          i$valstack[i$valstack_base + 18] = undefined;
          i$valstack[i$valstack_base + 19] = undefined;
          i$valstack[i$valstack_base + 20] = undefined;
          i$valstack[i$valstack_base + 21] = undefined;
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 18];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 19];
          i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 20];
          i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 21];
          i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 11];
          i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 8];
          i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 6];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 7;
          i$CALL(_idris_Effects_46_rebuildEnv$0,[oldbase,myoldbase]);
          i$CALL(_idris_Effects_46_rebuildEnv,[myoldbase]);
          break;
        case 0:
          i$ret = i$valstack[i$valstack_base + 6];
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
    case 0:
      switch(i$valstack[i$valstack_base + 4].tag){
        case 1:
          i$PROJECT(i$valstack[i$valstack_base + 4],7,3);
          i$ret = i$valstack[i$valstack_base + 6];
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
        case 0:
          i$ret = i$valstack[i$valstack_base + 6];
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
  };
}
var _idris_Effects_46_relabel$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 8] = i$ret;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 8]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_relabel = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 7;
  switch(i$valstack[i$valstack_base + 4].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 4],5,3);
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = undefined;
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 8];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 9];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 7];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 5;
      i$CALL(_idris_Effects_46_relabel$0,[oldbase,myoldbase]);
      i$CALL(_idris_Effects_46_relabel,[myoldbase]);
      break;
    case 0:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Effects_46_replaceEnvAt$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 13] = i$ret;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 13]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_replaceEnvAt = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 10;
  switch(i$valstack[i$valstack_base + 8].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 8],9,3);
      switch(i$valstack[i$valstack_base + 7].tag){
        case 1:
          i$valstack[i$valstack_base + 12] = i$valstack[i$valstack_base + 7].args[0];
          i$valstack[i$valstack_base + 13] = undefined;
          i$valstack[i$valstack_base + 14] = undefined;
          i$valstack[i$valstack_base + 15] = undefined;
          i$valstack[i$valstack_base + 16] = undefined;
          i$valstack[i$valstack_base + 17] = undefined;
          i$valstack[i$valstack_base + 18] = undefined;
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 13];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 14];
          i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 15];
          i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 16];
          i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 17];
          i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 18];
          i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 6];
          i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 12];
          i$valstack[i$valstack_top + 8] = i$valstack[i$valstack_base + 11];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 9;
          i$CALL(_idris_Effects_46_replaceEnvAt$0,[oldbase,myoldbase]);
          i$CALL(_idris_Effects_46_replaceEnvAt,[myoldbase]);
          break;
        case 0:
          i$ret = new i$CON(1,[i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 11]],null,null);
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
    case 0:
      switch(i$valstack[i$valstack_base + 7].tag){
        case 1:
          i$valstack[i$valstack_base + 9] = i$valstack[i$valstack_base + 7].args[0];
          i$ret = i$CON$0;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
        case 0:
          i$ret = i$CON$0;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
  };
}
var _idris_Effects_46_run = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 6;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_base + 8] = undefined;
  i$valstack[i$valstack_base + 9] = undefined;
  i$valstack[i$valstack_base + 10] = undefined;
  i$valstack[i$valstack_base + 11] = undefined;
  i$valstack[i$valstack_base + 12] = new i$CON(65681,[i$valstack[i$valstack_base + 4]],_idris__123_APPLY_95_0_125_$65681,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 11];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 12];
  i$SLIDE(8);
  i$valstack_top = i$valstack_base + 8;
  i$CALL(_idris_Effects_46_eff,[oldbase]);
}
var _idris_Prelude_46_Show_46_show = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$valstack[i$valstack_base + 1];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_showLitChar$4 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 8] = i$ret;
  i$valstack[i$valstack_base + 7] = new i$CON(65718,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8]],_idris__123_APPLY_95_0_125_$65718,null);
  i$ret = new i$CON(65708,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65708,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_showLitChar$3 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$ret = new i$CON(65735,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65735,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$valstack[i$valstack_base + 3] = undefined;
      i$valstack[i$valstack_base + 4] = undefined;
      i$valstack[i$valstack_base + 5] = undefined;
      i$valstack[i$valstack_base + 6] = "\\";
      i$valstack[i$valstack_base + 6] = new i$CON(65735,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65735,null);
      i$valstack[i$valstack_base + 7] = i$CON$65710;
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = i$CON$65736;
      i$valstack[i$valstack_base + 10] = i$CON$0;
      i$valstack[i$valstack_base + 11] = i$charCode(i$valstack[i$valstack_base]);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 8];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 9];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 11];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 4;
      i$CALL(_idris_Prelude_46_Show_46_showLitChar$4,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Show_46_primNumShow,[myoldbase]);
      break;
  };
}
var _idris_Prelude_46_Show_46_showLitChar$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Show_46_showLitChar$3,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 2:
      i$valstack[i$valstack_base + 2] = i$CON$1;
      break;
    default:
      i$valstack[i$valstack_base + 2] = i$CON$0;
  };
}
var _idris_Prelude_46_Show_46_showLitChar$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 1].args[0];
      i$valstack[i$valstack_base + 3] = undefined;
      i$valstack[i$valstack_base + 4] = undefined;
      i$valstack[i$valstack_base + 5] = undefined;
      i$valstack[i$valstack_base + 6] = "\\";
      i$valstack[i$valstack_base + 6] = new i$CON(65735,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65735,null);
      i$valstack[i$valstack_base + 7] = new i$CON(65721,[i$valstack[i$valstack_base + 2]],_idris__123_APPLY_95_0_125_$65721,null);
      i$ret = new i$CON(65708,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65708,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 0:
      i$valstack[i$valstack_base + 2] = "\u007F";
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Prelude_46_Show_46_showLitChar$2,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0,[myoldbase]);
      break;
  };
}
var _idris_Prelude_46_Show_46_showLitChar$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 3;
  i$CALL(_idris_Prelude_46_Show_46_showLitChar$1,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_showLitChar_58_getAt_58_10,[myoldbase]);
}
var _idris_Prelude_46_Show_46_showLitChar = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 11;
  if (i$valstack[i$valstack_base] == "\u0007") {
    i$ret = i$CON$65720;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\b") {
    i$ret = i$CON$65722;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\t") {
    i$ret = i$CON$65723;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\n") {
    i$ret = i$CON$65724;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\v") {
    i$ret = i$CON$65725;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\f") {
    i$ret = i$CON$65726;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\r") {
    i$ret = i$CON$65727;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\u000E") {
    i$valstack[i$valstack_base + 1] = i$CON$65728;
    i$valstack[i$valstack_base + 2] = "\\SO";
    i$ret = new i$CON(65718,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2]],_idris__123_APPLY_95_0_125_$65718,null);
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\\") {
    i$ret = i$CON$65729;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else if (i$valstack[i$valstack_base] == "\u007F") {
    i$ret = i$CON$65730;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$valstack[i$valstack_base + 1] = undefined;
    i$valstack[i$valstack_base + 2] = i$charCode(i$valstack[i$valstack_base]);
    i$valstack[i$valstack_base + 2] = i$bigInt(String(i$valstack[i$valstack_base + 2]));
    i$valstack[i$valstack_base + 3] = undefined;
    i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
    myoldbase.addr = i$valstack_base;
    i$valstack_base = i$valstack_top;
    i$valstack_top += 1;
    i$CALL(_idris_Prelude_46_Show_46_showLitChar$0,[oldbase,myoldbase]);
    i$CALL(_idris_Prelude_46_Show_46_showLitChar_58_asciiTab_58_10,[myoldbase]);
  };
}
var _idris_Prelude_46_Show_46_showLitString$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$ret = new i$CON(65708,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65708,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_showLitString$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$ret = new i$CON(65708,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65708,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_showLitString$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 6] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Show_46_showLitString$2,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_showLitString,[myoldbase]);
}
var _idris_Prelude_46_Show_46_showLitString = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 7;
  switch(i$valstack[i$valstack_base].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base],1,2);
      if (i$valstack[i$valstack_base + 1] == "\"") {
        i$valstack[i$valstack_base + 3] = undefined;
        i$valstack[i$valstack_base + 4] = undefined;
        i$valstack[i$valstack_base + 5] = undefined;
        i$valstack[i$valstack_base + 6] = i$CON$65732;
        i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
        myoldbase.addr = i$valstack_base;
        i$valstack_base = i$valstack_top;
        i$valstack_top += 1;
        i$CALL(_idris_Prelude_46_Show_46_showLitString$0,[oldbase,myoldbase]);
        i$CALL(_idris_Prelude_46_Show_46_showLitString,[myoldbase]);
      } else {
        i$valstack[i$valstack_base + 3] = undefined;
        i$valstack[i$valstack_base + 4] = undefined;
        i$valstack[i$valstack_base + 5] = undefined;
        i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
        myoldbase.addr = i$valstack_base;
        i$valstack_base = i$valstack_top;
        i$valstack_top += 1;
        i$CALL(_idris_Prelude_46_Show_46_showLitString$1,[oldbase,myoldbase]);
        i$CALL(_idris_Prelude_46_Show_46_showLitChar,[myoldbase]);
      };
      break;
    case 0:
      i$valstack[i$valstack_base + 1] = undefined;
      i$ret = new i$CON(65709,[i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65709,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Strings_46_strM$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 0:
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base][0];
      i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base].substr(1,i$valstack[i$valstack_base].length - 1);
      i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Strings_46_strM$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$CON$1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Strings_46_strM$2,[oldbase,myoldbase]);
  i$CALL(_idris_Decidable_46_Equality_46_Decidable_46_Equality_46__64_Decidable_46_Equality_46_DecEq_36_Bool_58__33_decEq_58_0,[myoldbase]);
}
var _idris_Prelude_46_Strings_46_strM$0 = function(oldbase,myoldbase){
  i$CALL(_idris_Prelude_46_Strings_46_strM$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$valstack[i$valstack_base + 1] = i$CON$1;
      break;
    case 1:
      i$valstack[i$valstack_base + 1] = i$CON$0;
      break;
  };
}
var _idris_Prelude_46_Strings_46_strM = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 1] = "";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  i$CALL(_idris_Prelude_46_Strings_46_strM$0,[oldbase,myoldbase]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$valstack[i$valstack_base + 1] = i$CON$0;
  } else {
    i$valstack[i$valstack_base + 1] = i$CON$1;
  };
}
var _idris_Effects_46_unlabel = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$PROJECT(i$valstack[i$valstack_base + 4],5,3);
  i$valstack[i$valstack_base + 8] = i$CON$0;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 8]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Strings_46_unpack$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Strings_46_unpack$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 1],2,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Strings_46_unpack$1,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Strings_46_unpack,[myoldbase]);
      break;
    case 0:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Strings_46_unpack = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Strings_46_unpack$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Effect_46_State_46_update$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 4] = new i$CON(65663,[i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65663,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effect_46_State_46_update = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effect_46_State_46_update$0,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_State_46_get,[myoldbase]);
}
var _idris__123_APPLY_95_0_125_$65663 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effect_46_State_46__123_update_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65664 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,14);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 8] = i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_top + 9] = i$valstack[i$valstack_base + 11];
  i$valstack[i$valstack_top + 10] = i$valstack[i$valstack_base + 12];
  i$valstack[i$valstack_top + 11] = i$valstack[i$valstack_base + 13];
  i$valstack[i$valstack_top + 12] = i$valstack[i$valstack_base + 14];
  i$valstack[i$valstack_top + 13] = i$valstack[i$valstack_base + 15];
  i$valstack[i$valstack_top + 14] = i$valstack[i$valstack_base + 1];
  i$SLIDE(15);
  i$valstack_top = i$valstack_base + 15;
  i$CALL(_idris_Effects_46_eff_95_Effects_95__95_idr_95_364_95_30_95_case,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65665 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65666 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65667 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_2_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65668 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_3_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65669 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Effects_46__123_eff_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65670 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_eff_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65671 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,3);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 1];
  i$SLIDE(4);
  i$valstack_top = i$valstack_base + 4;
  i$CALL(_idris_Effects_46__123_eff_95_2_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65672 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Effects_46__123_eff_95_3_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65673 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,4);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 1];
  i$SLIDE(5);
  i$valstack_top = i$valstack_base + 5;
  i$CALL(_idris_Effects_46__123_eff_95_4_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65674 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,3);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 1];
  i$SLIDE(4);
  i$valstack_top = i$valstack_base + 4;
  i$CALL(_idris_Effects_46__123_eff_95_5_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65675 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_eff_95_6_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65676 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,4);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 1];
  i$SLIDE(5);
  i$valstack_top = i$valstack_base + 5;
  i$CALL(_idris_Effects_46__123_execEff_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65677 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,3);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 1];
  i$SLIDE(4);
  i$valstack_top = i$valstack_base + 4;
  i$CALL(_idris_Effects_46__123_execEff_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65678 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,4);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 1];
  i$SLIDE(5);
  i$valstack_top = i$valstack_base + 5;
  i$CALL(_idris_Effects_46__123_execEff_95_2_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65679 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,3);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 1];
  i$SLIDE(4);
  i$valstack_top = i$valstack_base + 4;
  i$CALL(_idris_Effects_46__123_execEff_95_3_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65680 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Effects_46__123_run_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65681 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Effects_46__123_run_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65682 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65683 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_app_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65684 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_2_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65685 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Main_46__123_app_95_3_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65686 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_4_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65687 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_5_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65688 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Main_46__123_app_95_6_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65689 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_7_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65690 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_8_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65691 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_app_95_9_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65692 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65693 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_10_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65694 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_11_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65695 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_12_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65696 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_13_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65697 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_14_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65698 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_15_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65699 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65700 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Main_46__123_main_95_2_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65701 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_main_95_3_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65702 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_4_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65703 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_5_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65704 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_6_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65705 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_7_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65706 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Main_46__123_main_95_8_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65707 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Main_46__123_main_95_9_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65708 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,5);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 1];
  i$SLIDE(6);
  i$valstack_top = i$valstack_base + 6;
  i$CALL(_idris_Prelude_46_Basics_46__46_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65709 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Basics_46_id,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65710 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Chars_46_isDigit,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65711 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Functor_46__123_Prelude_46_Monad_46__64_Prelude_46_Functor_46_Functor_36_IO_39__32_ffi_58__33_map_58_0_95_lam_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65712 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Interactive_46_putChar,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65713 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Interactive_46__123_getChar_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65714 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Interactive_46__123_getChar_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65715 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Interactive_46__123_getLine_39__95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65716 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Interactive_46__123_getLine_39__95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65717 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Interactive_46__123_putStr_39__95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65718 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Prelude_46_Show_46_protectEsc,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65719 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_primNumShow_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65720 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65721 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_10_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65722 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65723 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_2_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65724 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_3_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65725 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_4_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65726 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_5_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65727 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_6_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65728 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_7_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65729 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_8_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65730 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95_9_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65731 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case_95_lam_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65732 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46__123_showLitString_95_0_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65733 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,5);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 1];
  i$SLIDE(6);
  i$valstack_top = i$valstack_base + 6;
  i$CALL(_idris_io_95_bind,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65734 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,3);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 1];
  i$SLIDE(4);
  i$valstack_top = i$valstack_base + 4;
  i$CALL(_idris_io_95_pure,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65735 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].args[0];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_prim_95__95_strCons,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65736 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_prim_95__95_toStrInt,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65737 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,2);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_prim_95_write,[oldbase]);
}
var _idris__123_APPLY_95_0_125_$65738 = function(oldbase,myoldbase){
  i$PROJECT(i$valstack[i$valstack_base],2,6);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 1];
  i$SLIDE(7);
  i$valstack_top = i$valstack_base + 7;
  i$CALL(_idris__123_io_95_bind_95_1_125_,[oldbase]);
}
var _idris__123_APPLY_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 14;
  if (i$valstack[i$valstack_base] instanceof i$CON && i$valstack[i$valstack_base].app) {
    i$valstack[i$valstack_base].app(oldbase,myoldbase);
  } else {
    i$ret = undefined;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris__123_EVAL_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  if (i$valstack[i$valstack_base] instanceof i$CON && i$valstack[i$valstack_base].ev) {
    i$valstack[i$valstack_base].ev(oldbase,myoldbase);
  } else {
    i$ret = i$valstack[i$valstack_base];
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46__123_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Interfaces_46__123_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Interfaces_46__123_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Functor_46__123_Prelude_46_Monad_46__64_Prelude_46_Functor_46_Functor_36_IO_39__32_ffi_58__33_map_58_0_95_lam_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$ret = new i$CON(65734,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],_idris__123_APPLY_95_0_125_$65734,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Functor_46__123_Prelude_46_Monad_46__64_Prelude_46_Functor_46_Functor_36_IO_39__32_ffi_58__33_map_58_0_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Functor_46__123_Prelude_46_Monad_46__64_Prelude_46_Functor_46_Functor_36_IO_39__32_ffi_58__33_map_58_0_95_lam_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46__123_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0,[oldbase]);
}
var _idris_Main_46__123_app_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 1]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Chars_46__123_chr_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 1] = i$ret;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    default:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Chars_46__123_chr_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = 1114112;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Chars_46__123_chr_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_0_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_eff_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 5;
  i$CALL(_idris_Effects_46__123_eff_95_0_125_$1,[oldbase,myoldbase]);
  i$CALL(_idris_Effects_46_relabel,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_eff_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46__123_execEff_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_base + 6] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_execEff_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_execEff_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Interactive_46__123_getChar_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Chars_46_chr,[oldbase]);
}
var _idris_Prelude_46_Interactive_46__123_getLine_39__95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$getLine();
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris__123_io_95_bind_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Prelude_46_Chars_46__123_isDigit_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "9";
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0,[oldbase]);
}
var _idris_Prelude_46_Chars_46__123_isSpace_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = " ";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_main_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_base + 2] = undefined;
  i$ret = new i$CON(65734,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65734,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_primNumShow_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "-";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Interactive_46__123_putStr_39__95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$ret = new i$CON(65734,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],_idris__123_APPLY_95_0_125_$65734,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46__123_run_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_run_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 3;
  i$CALL(_idris_Effects_46__123_run_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Applicative_46_pure,[myoldbase]);
}
var _idris__123_runMain_95_0_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris__123_EVAL_95_0_125_,[oldbase]);
}
var _idris__123_runMain_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base] = i$ret;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris__123_runMain_95_0_125_$1,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris__123_runMain_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$CALL(_idris__123_runMain_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Main_46_main,[myoldbase]);
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\a";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case_95_lam_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$valstack[i$valstack_base] + i$valstack[i$valstack_base + 1];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitString_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\\"";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effect_46_State_46__123_update_95_0_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$SLIDE(3);
  i$valstack_top = i$valstack_base + 3;
  i$CALL(_idris_Effect_46_State_46_put,[oldbase]);
}
var _idris_Effect_46_State_46__123_update_95_0_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effect_46_State_46__123_update_95_0_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_1_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_1_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Main_46__123_app_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_base] = i$valstack[i$valstack_top];
  i$valstack_top = i$valstack_base + 1;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0,[oldbase]);
}
var _idris_Effects_46__123_eff_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65669,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65669,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46__123_execEff_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65676,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2]],_idris__123_APPLY_95_0_125_$65676,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Interactive_46__123_getChar_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = getchar;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Interactive_46__123_getLine_39__95_1_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base + 3].split('').reverse().join('');
  i$ret = new i$CON(65734,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],_idris__123_APPLY_95_0_125_$65734,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Interactive_46__123_getLine_39__95_1_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$CALL(_idris_Prelude_46_Interactive_46__123_getLine_39__95_1_125_$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 3].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 3],4,2);
      if (i$valstack[i$valstack_base + 4] == "\n") {
        i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base + 5];
      } else {
        i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base + 4].concat(i$valstack[i$valstack_base + 5]);
      };
      break;
    case 0:
      i$valstack[i$valstack_base + 3] = "";
      break;
  };
}
var _idris_Prelude_46_Interactive_46__123_getLine_39__95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_base + 1] = undefined;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base].split('').reverse().join('');
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Interactive_46__123_getLine_39__95_1_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris__123_io_95_bind_95_1_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris__123_io_95_bind_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 6];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 7;
  i$CALL(_idris__123_io_95_bind_95_1_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_io_95_bind_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Chars_46__123_isSpace_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\v";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_main_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65692;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_primNumShow_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65719;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46__123_run_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65680,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65680,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_1_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\b";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_2_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_2_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Main_46__123_app_95_2_125_$0 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_base + 3] = 1;
      i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base] - i$valstack[i$valstack_base + 3];
      i$valstack[i$valstack_base + 4] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Main_46_app,[oldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 3] = i$CON$0;
      i$ret = new i$CON(0,[i$valstack[i$valstack_base + 3]],null,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Main_46__123_app_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 2] = 0;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 2]);
  i$CALL(_idris_Main_46__123_app_95_2_125_$0,[oldbase,myoldbase]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$valstack[i$valstack_base + 2] = i$CON$0;
  } else {
    i$valstack[i$valstack_base + 2] = i$CON$1;
  };
}
var _idris_Effects_46__123_eff_95_2_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 9] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 2];
  i$SLIDE(8);
  i$valstack_top = i$valstack_base + 8;
  i$CALL(_idris_Effects_46_eff,[oldbase]);
}
var _idris_Effects_46__123_eff_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 6;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_base + 8] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_eff_95_2_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46__123_execEff_95_2_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_base + 6] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_execEff_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_execEff_95_2_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris__123_io_95_bind_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65738,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5]],_idris__123_APPLY_95_0_125_$65738,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Chars_46__123_isSpace_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\f";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_main_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 7] = i$valstack[i$valstack_base + 2];
  i$SLIDE(8);
  i$valstack_top = i$valstack_base + 8;
  i$CALL(_idris_Effects_46_Effect_46_State_46__64_Effects_46_Handler_36_State_58_m_58__33_handle_58_0,[oldbase]);
}
var _idris_Prelude_46_Show_46__123_primNumShow_95_2_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 8] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Prelude_46_Show_46__123_primNumShow_95_2_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  switch(i$valstack[i$valstack_base + 5].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 5],6,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 3];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 4];
      i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 6];
      i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 7];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 7;
      i$CALL(_idris_Prelude_46_Show_46__123_primNumShow_95_2_125_$1,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Show_46__123_primNumShow_95_1_125_,[myoldbase]);
      break;
    case 0:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Show_46__123_primNumShow_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Show_46__123_primNumShow_95_2_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_2_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\t";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_3_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0_95_lam_95_3_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Main_46__123_app_95_3_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_base + 3] = new i$CON(3,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack[i$valstack_base + 4] = new i$CON(65684,[i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65684,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_3_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_base + 6] = " people";
  i$valstack[i$valstack_base + 5] = i$valstack[i$valstack_base + 5] + i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_base + 4] = i$valstack[i$valstack_base + 4] + i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_base + 5] = "\n";
  i$valstack[i$valstack_base + 4] = i$valstack[i$valstack_base + 4] + i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46__123_app_95_3_125_$1,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_StdIO_46_putStr,[myoldbase]);
}
var _idris_Main_46__123_app_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 3] = new i$CON(1,[i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 4] = i$CON$0;
  i$valstack[i$valstack_base + 3] = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack[i$valstack_base + 4] = "I\'ve said hello to the following people: ";
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = i$CON$65683;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 3;
  i$CALL(_idris_Main_46__123_app_95_3_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65671,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65671,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46__123_execEff_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65678,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2]],_idris__123_APPLY_95_0_125_$65678,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Chars_46__123_isSpace_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\n";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_main_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65700,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65700,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_3_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\n";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_4_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_base + 2] = new i$CON(0,[i$valstack[i$valstack_base + 2]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(65685,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65685,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_4_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46__123_app_95_4_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_List_46_length,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_4_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 6] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46__123_eff_95_4_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_base + 8] = undefined;
  i$valstack[i$valstack_base + 9] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 7;
  i$CALL(_idris_Effects_46__123_eff_95_4_125_$1,[oldbase,myoldbase]);
  i$CALL(_idris_Effects_46_rebuildEnv,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_4_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46__123_eff_95_4_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Chars_46__123_isSpace_95_4_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\r";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_main_95_4_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65701,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65701,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_4_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\v";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_5_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 2] = new i$CON(3,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(65686,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65686,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_5_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46__123_app_95_5_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_State_46_get,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_5_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65673,[i$valstack[i$valstack_base],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2]],_idris__123_APPLY_95_0_125_$65673,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Chars_46__123_isSpace_95_5_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\t";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_main_95_5_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65702;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_5_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\f";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_6_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_base + 3] = new i$CON(3,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack[i$valstack_base + 4] = new i$CON(65687,[i$valstack[i$valstack_base + 1]],_idris__123_APPLY_95_0_125_$65687,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_6_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 4] = i$CON$0;
  i$valstack[i$valstack_base + 3] = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = new i$CON(65682,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65682,null);
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 6];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 3;
  i$CALL(_idris_Main_46__123_app_95_6_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_State_46_update,[myoldbase]);
}
var _idris_Effects_46__123_eff_95_6_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 12;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_base + 8] = undefined;
  i$valstack[i$valstack_base + 9] = undefined;
  i$valstack[i$valstack_base + 10] = undefined;
  i$valstack[i$valstack_base + 11] = undefined;
  i$valstack[i$valstack_base + 12] = undefined;
  i$valstack[i$valstack_base + 13] = undefined;
  i$ret = new i$CON(65664,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base],i$valstack[i$valstack_base + 11],i$valstack[i$valstack_base + 12],i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 13]],_idris__123_APPLY_95_0_125_$65664,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_6_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65703;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_6_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\r";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_7_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 2] = new i$CON(3,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(65688,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65688,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_7_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2]],null,null);
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = "Hello ";
  i$valstack[i$valstack_base + 4] = "!";
  i$valstack[i$valstack_base + 4] = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base + 3] + i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_base + 4] = "\n";
  i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base + 3] + i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46__123_app_95_7_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_StdIO_46_putStr,[myoldbase]);
}
var _idris_Main_46__123_main_95_7_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65704;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_7_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "H";
  i$valstack[i$valstack_base + 1] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  if (i$valstack[i$valstack_base + 1] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Main_46__123_app_95_8_125_$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = new i$CON(0,[i$valstack[i$valstack_base + 2]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(65689,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65689,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_8_125_$6 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
}
var _idris_Main_46__123_app_95_8_125_$5 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 7];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46__123_app_95_8_125_$6,[oldbase,myoldbase]);
  i$CALL(_idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54,[myoldbase]);
}
var _idris_Main_46__123_app_95_8_125_$4 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  switch(i$valstack[i$valstack_base + 5].tag){
    case 0:
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 3].concat(i$valstack[i$valstack_base + 4]);
      break;
    case 1:
      i$valstack[i$valstack_base + 6] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Main_46__123_app_95_8_125_$5,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
      break;
  };
}
var _idris_Main_46__123_app_95_8_125_$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Main_46__123_app_95_8_125_$3,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 2],3,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Main_46__123_app_95_8_125_$4,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46_isSpace,[myoldbase]);
      break;
    case 0:
      i$valstack[i$valstack_base + 2] = "";
      break;
  };
}
var _idris_Main_46__123_app_95_8_125_$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 2].split('').reverse().join('');
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Main_46__123_app_95_8_125_$2,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Main_46__123_app_95_8_125_$9 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
}
var _idris_Main_46__123_app_95_8_125_$8 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 7];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Main_46__123_app_95_8_125_$9,[oldbase,myoldbase]);
  i$CALL(_idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54,[myoldbase]);
}
var _idris_Main_46__123_app_95_8_125_$7 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  switch(i$valstack[i$valstack_base + 5].tag){
    case 0:
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 3].concat(i$valstack[i$valstack_base + 4]);
      break;
    case 1:
      i$valstack[i$valstack_base + 6] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Main_46__123_app_95_8_125_$8,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
      break;
  };
}
var _idris_Main_46__123_app_95_8_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Main_46__123_app_95_8_125_$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 2],3,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Main_46__123_app_95_8_125_$7,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46_isSpace,[myoldbase]);
      break;
    case 0:
      i$valstack[i$valstack_base + 2] = "";
      break;
  };
}
var _idris_Main_46__123_app_95_8_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 6;
  i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 1].split('').reverse().join('');
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Main_46__123_app_95_8_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Main_46__123_main_95_8_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65705;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_8_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\\\";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_9_125_$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 2] = new i$CON(3,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(65690,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65690,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_app_95_9_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2]],null,null);
  i$valstack[i$valstack_base + 3] = i$CON$0;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Main_46__123_app_95_9_125_$0,[oldbase,myoldbase]);
  i$CALL(_idris_Effect_46_StdIO_46_getStr,[myoldbase]);
}
var _idris_Main_46__123_main_95_9_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  i$valstack[i$valstack_base + 2] = undefined;
  i$valstack[i$valstack_base + 3] = undefined;
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 5] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 6] = i$valstack[i$valstack_base + 1];
  i$SLIDE(7);
  i$valstack_top = i$valstack_base + 7;
  i$CALL(_idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0,[oldbase]);
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_9_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_base + 1] = "\\DEL";
  i$ret = i$valstack[i$valstack_base + 1] + i$valstack[i$valstack_base];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_10_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = new i$CON(65707,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65707,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46__123_showLitChar_95_10_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$valstack[i$valstack_base] + i$valstack[i$valstack_base + 1];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_11_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65693;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_12_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65694;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_13_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65695;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_14_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65696;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Main_46__123_main_95_15_125_ = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$ret = i$CON$65697;
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$ret = i$valstack[i$valstack_base + 3] + i$valstack[i$valstack_base + 7];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 7] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$1,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 9] = i$ret;
  i$valstack[i$valstack_base + 10] = ", ";
  i$valstack[i$valstack_base + 9] = i$valstack[i$valstack_base + 9] + i$valstack[i$valstack_base + 10];
  i$valstack[i$valstack_base + 9] = i$valstack[i$valstack_base + 3] + i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 6];
  i$SLIDE(5);
  i$valstack_top = i$valstack_base + 5;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0,[oldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 9] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$3,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 6;
  switch(i$valstack[i$valstack_base + 4].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 4],5,2);
      switch(i$valstack[i$valstack_base + 6].tag){
        case 0:
          i$valstack[i$valstack_base + 7] = undefined;
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 2;
          i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$0,[oldbase,myoldbase]);
          i$CALL(_idris_Prelude_46_Show_46_show,[myoldbase]);
          break;
        default:
          i$valstack[i$valstack_base + 7] = undefined;
          i$valstack[i$valstack_base + 8] = undefined;
          i$valstack[i$valstack_base + 9] = undefined;
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 2;
          i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0$2,[oldbase,myoldbase]);
          i$CALL(_idris_Prelude_46_Show_46_show,[myoldbase]);
      };
      break;
    case 0:
      i$ret = i$valstack[i$valstack_base + 3];
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Decidable_46_Equality_46_Decidable_46_Equality_46__64_Decidable_46_Equality_46_DecEq_36_Bool_58__33_decEq_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 0:
      switch(i$valstack[i$valstack_base].tag){
        case 0:
          i$ret = i$CON$0;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
        case 1:
          i$ret = i$CON$1;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
    case 1:
      switch(i$valstack[i$valstack_base].tag){
        case 0:
          i$ret = i$CON$1;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
        case 1:
          i$ret = i$CON$0;
          i$valstack_top = i$valstack_base;
          i$valstack_base = oldbase.addr;
          break;
      };
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Nat_46__64_Prelude_46_Interfaces_46_Eq_36_Nat_58__33__61__61__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  if (i$valstack[i$valstack_base + 1].equals(i$ZERO)) {
    if (i$valstack[i$valstack_base].equals(i$ZERO)) {
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
    } else {
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
    };
  } else {
    i$valstack[i$valstack_base + 2] = i$ONE;
    i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 1].subtract(i$valstack[i$valstack_base + 2]);
    if (i$valstack[i$valstack_base].equals(i$ZERO)) {
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
    } else {
      i$valstack[i$valstack_base + 3] = i$ONE;
      i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base].subtract(i$valstack[i$valstack_base + 3]);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Nat_46__64_Prelude_46_Interfaces_46_Eq_36_Nat_58__33__61__61__58_0,[oldbase]);
    };
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_base + 3] = +(i$valstack[i$valstack_base + 3].equals(i$valstack[i$valstack_base + 4]));
  if (i$valstack[i$valstack_base + 3] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$1,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base + 2].equals(i$valstack[i$valstack_base + 3]));
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$ret = i$CON$0;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  } else {
    i$ret = i$CON$1;
    i$valstack_top = i$valstack_base;
    i$valstack_base = oldbase.addr;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$3,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 4:
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 1].args[0];
      switch(i$valstack[i$valstack_base].tag){
        case 4:
          i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base].args[0];
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
          i$SLIDE(2);
          i$valstack_top = i$valstack_base + 2;
          i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Nat_46__64_Prelude_46_Interfaces_46_Eq_36_Nat_58__33__61__61__58_0,[oldbase]);
          break;
        default:
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 1;
          i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$0,[oldbase,myoldbase]);
          i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
      };
      break;
    default:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Eq_36_Prec_58__33__61__61__58_0$2,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
  };
}
var _idris_Prelude_46_Functor_46_Prelude_46_Monad_46__64_Prelude_46_Functor_46_Functor_36_IO_39__32_ffi_58__33_map_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = undefined;
  i$valstack[i$valstack_base + 7] = undefined;
  i$valstack[i$valstack_base + 8] = new i$CON(65711,[i$valstack[i$valstack_base + 3]],_idris__123_APPLY_95_0_125_$65711,null);
  i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 8]],_idris__123_APPLY_95_0_125_$65733,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_Effect_46_State_46__64_Effects_46_Handler_36_State_58_m_58__33_handle_58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 8] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 8];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46_Effect_46_State_46__64_Effects_46_Handler_36_State_58_m_58__33_handle_58_0$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 9] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 8];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46_Effect_46_State_46__64_Effects_46_Handler_36_State_58_m_58__33_handle_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  switch(i$valstack[i$valstack_base + 6].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Effects_46_Effect_46_State_46__64_Effects_46_Handler_36_State_58_m_58__33_handle_58_0$0,[oldbase,myoldbase]);
      i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 8] = i$valstack[i$valstack_base + 6].args[0];
      i$valstack[i$valstack_base + 9] = i$CON$0;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 7];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 9];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Effects_46_Effect_46_State_46__64_Effects_46_Handler_36_State_58_m_58__33_handle_58_0$1,[oldbase,myoldbase]);
      i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
      break;
  };
}
var _idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 10] = i$ret;
  i$valstack[i$valstack_base + 11] = new i$CON(65665,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65665,null);
  i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 11]],_idris__123_APPLY_95_0_125_$65733,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 10] = i$ret;
  i$valstack[i$valstack_base + 11] = new i$CON(65666,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65666,null);
  i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 11]],_idris__123_APPLY_95_0_125_$65733,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 11] = i$ret;
  i$valstack[i$valstack_base + 12] = new i$CON(65668,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65668,null);
  i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 11],i$valstack[i$valstack_base + 12]],_idris__123_APPLY_95_0_125_$65733,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 6;
  switch(i$valstack[i$valstack_base + 5].tag){
    case 3:
      i$valstack[i$valstack_base + 7] = undefined;
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = undefined;
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$CALL(_idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0$0,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Interactive_46_getChar,[myoldbase]);
      break;
    case 1:
      i$valstack[i$valstack_base + 7] = undefined;
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = undefined;
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 10];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0$1,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Interactive_46_getLine_39_,[myoldbase]);
      break;
    case 2:
      i$valstack[i$valstack_base + 7] = i$valstack[i$valstack_base + 5].args[0];
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = undefined;
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = new i$CON(65712,[i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65712,null);
      i$valstack[i$valstack_base + 12] = new i$CON(65667,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65667,null);
      i$ret = new i$CON(65733,[i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 11],i$valstack[i$valstack_base + 12]],_idris__123_APPLY_95_0_125_$65733,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 0:
      i$valstack[i$valstack_base + 7] = i$valstack[i$valstack_base + 5].args[0];
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = undefined;
      i$valstack[i$valstack_base + 10] = undefined;
      i$valstack[i$valstack_base + 11] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 11];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 7];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 2;
      i$CALL(_idris_Effects_46_Effect_46_StdIO_46__64_Effects_46_Handler_36_StdIO_58_IO_58__33_handle_58_0$2,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Interactive_46_putStr_39_,[myoldbase]);
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Prelude_46_Interfaces_46__123_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0_95_lam_95_0_125_,[oldbase]);
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_base + 2] = i$CON$1;
      break;
    default:
      i$valstack[i$valstack_base + 2] = i$CON$0;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__60__61__58_0$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Prelude_46_Interfaces_46__123_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0_95_lam_95_0_125_,[oldbase]);
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 2:
      i$valstack[i$valstack_base + 2] = i$CON$1;
      break;
    default:
      i$valstack[i$valstack_base + 2] = i$CON$0;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33__62__61__58_0$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 3].tag){
    case 0:
      i$ret = i$CON$2;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0$0 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_base + 3] = +(i$valstack[i$valstack_base] < i$valstack[i$valstack_base + 1]);
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0$1,[oldbase,myoldbase]);
      if (i$valstack[i$valstack_base + 3] == 0) {
        i$valstack[i$valstack_base + 3] = i$CON$0;
      } else {
        i$valstack[i$valstack_base + 3] = i$CON$1;
      };
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Char_58__33_compare_58_0$0,[oldbase,myoldbase]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$valstack[i$valstack_base + 2] = i$CON$0;
  } else {
    i$valstack[i$valstack_base + 2] = i$CON$1;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Prelude_46_Interfaces_46__123_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0_95_lam_95_0_125_,[oldbase]);
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 2:
      i$valstack[i$valstack_base + 2] = i$CON$1;
      break;
    default:
      i$valstack[i$valstack_base + 2] = i$CON$0;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33__62__61__58_0$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 3].tag){
    case 0:
      i$ret = i$CON$2;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0$0 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_base + 3] = +(i$valstack[i$valstack_base] < i$valstack[i$valstack_base + 1]);
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0$1,[oldbase,myoldbase]);
      if (i$valstack[i$valstack_base + 3] == 0) {
        i$valstack[i$valstack_base + 3] = i$CON$0;
      } else {
        i$valstack[i$valstack_base + 3] = i$CON$1;
      };
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base] == i$valstack[i$valstack_base + 1]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Int_58__33_compare_58_0$0,[oldbase,myoldbase]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$valstack[i$valstack_base + 2] = i$CON$0;
  } else {
    i$valstack[i$valstack_base + 2] = i$CON$1;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 3].tag){
    case 0:
      i$ret = i$CON$2;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0$0 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_base + 3] = +(i$valstack[i$valstack_base].lesser(i$valstack[i$valstack_base + 1]));
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0$1,[oldbase,myoldbase]);
      if (i$valstack[i$valstack_base + 3] == 0) {
        i$valstack[i$valstack_base + 3] = i$CON$0;
      } else {
        i$valstack[i$valstack_base + 3] = i$CON$1;
      };
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  i$valstack[i$valstack_base + 2] = +(i$valstack[i$valstack_base].equals(i$valstack[i$valstack_base + 1]));
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0$0,[oldbase,myoldbase]);
  if (i$valstack[i$valstack_base + 2] == 0) {
    i$valstack[i$valstack_base + 2] = i$CON$0;
  } else {
    i$valstack[i$valstack_base + 2] = i$CON$1;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Nat_46__64_Prelude_46_Interfaces_46_Ord_36_Nat_58__33_compare_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 2;
  if (i$valstack[i$valstack_base + 1].equals(i$ZERO)) {
    if (i$valstack[i$valstack_base].equals(i$ZERO)) {
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
    } else {
      i$valstack[i$valstack_base + 2] = i$ONE;
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base].subtract(i$valstack[i$valstack_base + 2]);
      i$ret = i$CON$2;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
    };
  } else {
    i$valstack[i$valstack_base + 2] = i$ONE;
    i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 1].subtract(i$valstack[i$valstack_base + 2]);
    if (i$valstack[i$valstack_base].equals(i$ZERO)) {
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
    } else {
      i$valstack[i$valstack_base + 3] = i$ONE;
      i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base].subtract(i$valstack[i$valstack_base + 3]);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Nat_46__64_Prelude_46_Interfaces_46_Ord_36_Nat_58__33_compare_58_0,[oldbase]);
    };
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
      i$SLIDE(2);
      i$valstack_top = i$valstack_base + 2;
      i$CALL(_idris_Prelude_46_Interfaces_46__123_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0_95_lam_95_0_125_,[oldbase]);
      break;
    case 1:
      i$ret = i$CON$1;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 2:
      i$valstack[i$valstack_base + 2] = i$CON$1;
      break;
    default:
      i$valstack[i$valstack_base + 2] = i$CON$0;
  };
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 1;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33__62__61__58_0$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 4];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0,[oldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$1,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 3] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Interfaces_46__64_Prelude_46_Interfaces_46_Ord_36_Integer_58__33_compare_58_0,[oldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 1];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$3,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
}
var _idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 3;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 4:
      i$valstack[i$valstack_base + 2] = i$valstack[i$valstack_base + 1].args[0];
      switch(i$valstack[i$valstack_base].tag){
        case 4:
          i$valstack[i$valstack_base + 3] = i$valstack[i$valstack_base].args[0];
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
          i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 2];
          i$SLIDE(2);
          i$valstack_top = i$valstack_base + 2;
          i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Nat_46__64_Prelude_46_Interfaces_46_Ord_36_Nat_58__33_compare_58_0,[oldbase]);
          break;
        default:
          i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
          myoldbase.addr = i$valstack_base;
          i$valstack_base = i$valstack_top;
          i$valstack_top += 1;
          i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$0,[oldbase,myoldbase]);
          i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
      };
      break;
    default:
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Interfaces_46_Prelude_46_Show_46__64_Prelude_46_Interfaces_46_Ord_36_Prec_58__33_compare_58_0$2,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Show_46_precCon,[myoldbase]);
  };
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$valstack[i$valstack_base + 5] = "]";
  i$valstack[i$valstack_base + 4] = i$valstack[i$valstack_base + 4] + i$valstack[i$valstack_base + 5];
  i$ret = i$valstack[i$valstack_base + 3] + i$valstack[i$valstack_base + 4];
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$valstack[i$valstack_base + 3] = "[";
  i$valstack[i$valstack_base + 4] = undefined;
  i$valstack[i$valstack_base + 5] = undefined;
  i$valstack[i$valstack_base + 6] = "";
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 1];
  i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 6];
  i$valstack[i$valstack_top + 4] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 5;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_List_32_a_58__33_show_58_0_58_show_39__58_0,[myoldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$3 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$ret = i$valstack[i$valstack_base + 1].concat(i$valstack[i$valstack_base + 2]);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$valstack[i$valstack_base + 3] = "\"";
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 3];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$3,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$2,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Show_46_showLitString,[myoldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$5 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 5]],null,null);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$4 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 6] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$5,[oldbase,myoldbase]);
  i$CALL(_idris__95_Prelude_46_Strings_46_unpack_95_with_95_35,[myoldbase]);
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 2],3,2);
      i$valstack[i$valstack_base + 5] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$4,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
      break;
    case 0:
      i$valstack[i$valstack_base + 2] = i$CON$0;
      break;
  };
}
var _idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 6;
  i$valstack[i$valstack_base + 1] = "\"";
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 1;
  i$CALL(_idris_Prelude_46_Show_46_Prelude_46_Show_46__64_Prelude_46_Show_46_Show_36_String_58__33_show_58_0$0,[oldbase,myoldbase]);
  i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
}
var _idris_Prelude_46_Show_46_showLitChar_58_asciiTab_58_10 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 33;
  i$valstack[i$valstack_base + 1] = "NUL";
  i$valstack[i$valstack_base + 2] = "SOH";
  i$valstack[i$valstack_base + 3] = "STX";
  i$valstack[i$valstack_base + 4] = "ETX";
  i$valstack[i$valstack_base + 5] = "EOT";
  i$valstack[i$valstack_base + 6] = "ENQ";
  i$valstack[i$valstack_base + 7] = "ACK";
  i$valstack[i$valstack_base + 8] = "BEL";
  i$valstack[i$valstack_base + 9] = "BS";
  i$valstack[i$valstack_base + 10] = "HT";
  i$valstack[i$valstack_base + 11] = "LF";
  i$valstack[i$valstack_base + 12] = "VT";
  i$valstack[i$valstack_base + 13] = "FF";
  i$valstack[i$valstack_base + 14] = "CR";
  i$valstack[i$valstack_base + 15] = "SO";
  i$valstack[i$valstack_base + 16] = "SI";
  i$valstack[i$valstack_base + 17] = "DLE";
  i$valstack[i$valstack_base + 18] = "DC1";
  i$valstack[i$valstack_base + 19] = "DC2";
  i$valstack[i$valstack_base + 20] = "DC3";
  i$valstack[i$valstack_base + 21] = "DC4";
  i$valstack[i$valstack_base + 22] = "NAK";
  i$valstack[i$valstack_base + 23] = "SYN";
  i$valstack[i$valstack_base + 24] = "ETB";
  i$valstack[i$valstack_base + 25] = "CAN";
  i$valstack[i$valstack_base + 26] = "EM";
  i$valstack[i$valstack_base + 27] = "SUB";
  i$valstack[i$valstack_base + 28] = "ESC";
  i$valstack[i$valstack_base + 29] = "FS";
  i$valstack[i$valstack_base + 30] = "GS";
  i$valstack[i$valstack_base + 31] = "RS";
  i$valstack[i$valstack_base + 32] = "US";
  i$valstack[i$valstack_base + 33] = i$CON$0;
  i$valstack[i$valstack_base + 32] = new i$CON(1,[i$valstack[i$valstack_base + 32],i$valstack[i$valstack_base + 33]],null,null);
  i$valstack[i$valstack_base + 31] = new i$CON(1,[i$valstack[i$valstack_base + 31],i$valstack[i$valstack_base + 32]],null,null);
  i$valstack[i$valstack_base + 30] = new i$CON(1,[i$valstack[i$valstack_base + 30],i$valstack[i$valstack_base + 31]],null,null);
  i$valstack[i$valstack_base + 29] = new i$CON(1,[i$valstack[i$valstack_base + 29],i$valstack[i$valstack_base + 30]],null,null);
  i$valstack[i$valstack_base + 28] = new i$CON(1,[i$valstack[i$valstack_base + 28],i$valstack[i$valstack_base + 29]],null,null);
  i$valstack[i$valstack_base + 27] = new i$CON(1,[i$valstack[i$valstack_base + 27],i$valstack[i$valstack_base + 28]],null,null);
  i$valstack[i$valstack_base + 26] = new i$CON(1,[i$valstack[i$valstack_base + 26],i$valstack[i$valstack_base + 27]],null,null);
  i$valstack[i$valstack_base + 25] = new i$CON(1,[i$valstack[i$valstack_base + 25],i$valstack[i$valstack_base + 26]],null,null);
  i$valstack[i$valstack_base + 24] = new i$CON(1,[i$valstack[i$valstack_base + 24],i$valstack[i$valstack_base + 25]],null,null);
  i$valstack[i$valstack_base + 23] = new i$CON(1,[i$valstack[i$valstack_base + 23],i$valstack[i$valstack_base + 24]],null,null);
  i$valstack[i$valstack_base + 22] = new i$CON(1,[i$valstack[i$valstack_base + 22],i$valstack[i$valstack_base + 23]],null,null);
  i$valstack[i$valstack_base + 21] = new i$CON(1,[i$valstack[i$valstack_base + 21],i$valstack[i$valstack_base + 22]],null,null);
  i$valstack[i$valstack_base + 20] = new i$CON(1,[i$valstack[i$valstack_base + 20],i$valstack[i$valstack_base + 21]],null,null);
  i$valstack[i$valstack_base + 19] = new i$CON(1,[i$valstack[i$valstack_base + 19],i$valstack[i$valstack_base + 20]],null,null);
  i$valstack[i$valstack_base + 18] = new i$CON(1,[i$valstack[i$valstack_base + 18],i$valstack[i$valstack_base + 19]],null,null);
  i$valstack[i$valstack_base + 17] = new i$CON(1,[i$valstack[i$valstack_base + 17],i$valstack[i$valstack_base + 18]],null,null);
  i$valstack[i$valstack_base + 16] = new i$CON(1,[i$valstack[i$valstack_base + 16],i$valstack[i$valstack_base + 17]],null,null);
  i$valstack[i$valstack_base + 15] = new i$CON(1,[i$valstack[i$valstack_base + 15],i$valstack[i$valstack_base + 16]],null,null);
  i$valstack[i$valstack_base + 14] = new i$CON(1,[i$valstack[i$valstack_base + 14],i$valstack[i$valstack_base + 15]],null,null);
  i$valstack[i$valstack_base + 13] = new i$CON(1,[i$valstack[i$valstack_base + 13],i$valstack[i$valstack_base + 14]],null,null);
  i$valstack[i$valstack_base + 12] = new i$CON(1,[i$valstack[i$valstack_base + 12],i$valstack[i$valstack_base + 13]],null,null);
  i$valstack[i$valstack_base + 11] = new i$CON(1,[i$valstack[i$valstack_base + 11],i$valstack[i$valstack_base + 12]],null,null);
  i$valstack[i$valstack_base + 10] = new i$CON(1,[i$valstack[i$valstack_base + 10],i$valstack[i$valstack_base + 11]],null,null);
  i$valstack[i$valstack_base + 9] = new i$CON(1,[i$valstack[i$valstack_base + 9],i$valstack[i$valstack_base + 10]],null,null);
  i$valstack[i$valstack_base + 8] = new i$CON(1,[i$valstack[i$valstack_base + 8],i$valstack[i$valstack_base + 9]],null,null);
  i$valstack[i$valstack_base + 7] = new i$CON(1,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8]],null,null);
  i$valstack[i$valstack_base + 6] = new i$CON(1,[i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7]],null,null);
  i$valstack[i$valstack_base + 5] = new i$CON(1,[i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6]],null,null);
  i$valstack[i$valstack_base + 4] = new i$CON(1,[i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5]],null,null);
  i$valstack[i$valstack_base + 3] = new i$CON(1,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack[i$valstack_base + 2] = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 3]],null,null);
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 1],i$valstack[i$valstack_base + 2]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_showLitChar_58_getAt_58_10 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  switch(i$valstack[i$valstack_base + 2].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 2],3,2);
      if (i$valstack[i$valstack_base + 1].equals(i$ZERO)) {
        i$ret = new i$CON(1,[i$valstack[i$valstack_base + 3]],null,null);
        i$valstack_top = i$valstack_base;
        i$valstack_base = oldbase.addr;
      } else {
        i$valstack[i$valstack_base + 5] = i$ONE;
        i$valstack[i$valstack_base + 5] = i$valstack[i$valstack_base + 1].subtract(i$valstack[i$valstack_base + 5]);
        i$valstack[i$valstack_base + 6] = undefined;
        i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 6];
        i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
        i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 4];
        i$SLIDE(3);
        i$valstack_top = i$valstack_base + 3;
        i$CALL(_idris_Prelude_46_Show_46_showLitChar_58_getAt_58_10,[oldbase]);
      };
      break;
    case 0:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris__95_Prelude_46_Strings_46_unpack_95_with_95_35$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 2],i$valstack[i$valstack_base + 4]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris__95_Prelude_46_Strings_46_unpack_95_with_95_35$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 5] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 4];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 5];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris__95_Prelude_46_Strings_46_unpack_95_with_95_35$1,[oldbase,myoldbase]);
  i$CALL(_idris__95_Prelude_46_Strings_46_unpack_95_with_95_35,[myoldbase]);
}
var _idris__95_Prelude_46_Strings_46_unpack_95_with_95_35 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 1],2,2);
      i$valstack[i$valstack_base + 4] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris__95_Prelude_46_Strings_46_unpack_95_with_95_35$0,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
      break;
    case 0:
      i$ret = i$CON$0;
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54$1 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 6] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 5];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 6];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54,[oldbase]);
}
var _idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 4] = i$ret;
  switch(i$valstack[i$valstack_base + 4].tag){
    case 0:
      i$ret = i$valstack[i$valstack_base + 2].concat(i$valstack[i$valstack_base + 3]);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$valstack[i$valstack_base + 5] = undefined;
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 3];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54$1,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Strings_46_strM,[myoldbase]);
      break;
  };
}
var _idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54 = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 5;
  switch(i$valstack[i$valstack_base + 1].tag){
    case 1:
      i$PROJECT(i$valstack[i$valstack_base + 1],2,2);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 2];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 1;
      i$CALL(_idris__95_Prelude_46_Strings_46_ltrim_95_with_95_54$0,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Chars_46_isSpace,[myoldbase]);
      break;
    case 0:
      i$ret = "";
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
  };
}
var _idris_Prelude_46_Show_46_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case$2 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 8] = i$ret;
  i$valstack[i$valstack_base + 7] = new i$CON(65718,[i$valstack[i$valstack_base + 7],i$valstack[i$valstack_base + 8]],_idris__123_APPLY_95_0_125_$65718,null);
  i$ret = new i$CON(65708,[i$valstack[i$valstack_base + 3],i$valstack[i$valstack_base + 4],i$valstack[i$valstack_base + 5],i$valstack[i$valstack_base + 6],i$valstack[i$valstack_base + 7]],_idris__123_APPLY_95_0_125_$65708,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Prelude_46_Show_46_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case$1 = function(oldbase,myoldbase){
  switch(i$valstack[i$valstack_base + 2].tag){
    case 0:
      i$ret = new i$CON(65735,[i$valstack[i$valstack_base]],_idris__123_APPLY_95_0_125_$65735,null);
      i$valstack_top = i$valstack_base;
      i$valstack_base = oldbase.addr;
      break;
    case 1:
      i$valstack[i$valstack_base + 3] = undefined;
      i$valstack[i$valstack_base + 4] = undefined;
      i$valstack[i$valstack_base + 5] = undefined;
      i$valstack[i$valstack_base + 6] = "\\";
      i$valstack[i$valstack_base + 6] = new i$CON(65735,[i$valstack[i$valstack_base + 6]],_idris__123_APPLY_95_0_125_$65735,null);
      i$valstack[i$valstack_base + 7] = i$CON$65710;
      i$valstack[i$valstack_base + 8] = undefined;
      i$valstack[i$valstack_base + 9] = i$CON$65736;
      i$valstack[i$valstack_base + 10] = i$CON$0;
      i$valstack[i$valstack_base + 11] = i$charCode(i$valstack[i$valstack_base]);
      i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 8];
      i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 9];
      i$valstack[i$valstack_top + 2] = i$valstack[i$valstack_base + 10];
      i$valstack[i$valstack_top + 3] = i$valstack[i$valstack_base + 11];
      myoldbase.addr = i$valstack_base;
      i$valstack_base = i$valstack_top;
      i$valstack_top += 4;
      i$CALL(_idris_Prelude_46_Show_46_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case$2,[oldbase,myoldbase]);
      i$CALL(_idris_Prelude_46_Show_46_primNumShow,[myoldbase]);
      break;
  };
}
var _idris_Prelude_46_Show_46_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 2] = i$ret;
  i$CALL(_idris_Prelude_46_Show_46_showLitChar_95__95__95__95__95_Prelude_95__95_Show_95__95_idr_95_128_95_27_95_case$1,[oldbase,myoldbase]);
  switch(i$valstack[i$valstack_base + 2].tag){
    case 2:
      i$valstack[i$valstack_base + 2] = i$CON$1;
      break;
    default:
      i$valstack[i$valstack_base + 2] = i$CON$0;
  };
}
var _idris_Effects_46_dropEnv_95_Effects_95__95_idr_95_156_95_7_95_case$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 17] = i$ret;
  i$ret = new i$CON(1,[i$valstack[i$valstack_base + 14],i$valstack[i$valstack_base + 15],i$valstack[i$valstack_base + 17]],null,null);
  i$valstack_top = i$valstack_base;
  i$valstack_base = oldbase.addr;
}
var _idris_Effects_46_eff_95_Effects_95__95_idr_95_364_95_30_95_case$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 18] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 18];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 17];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var _idris_Effects_46_eff_95_Effects_95__95_idr_95_364_95_30_95_case = function(oldbase){
  var myoldbase = new i$POINTER();
  i$valstack_top += 4;
  i$PROJECT(i$valstack[i$valstack_base + 14],15,3);
  ;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 9];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 12];
  myoldbase.addr = i$valstack_base;
  i$valstack_base = i$valstack_top;
  i$valstack_top += 2;
  i$CALL(_idris_Effects_46_eff_95_Effects_95__95_idr_95_364_95_30_95_case$0,[oldbase,myoldbase]);
  i$CALL(_idris__123_APPLY_95_0_125_,[myoldbase]);
}
var _idris_Effects_46_eff_95_Effects_95__95_idr_95_364_95_30_95_case_95_Effects_95__95_idr_95_364_95_34_95_case$0 = function(oldbase,myoldbase){
  i$valstack[i$valstack_base + 19] = i$ret;
  i$valstack[i$valstack_top] = i$valstack[i$valstack_base + 19];
  i$valstack[i$valstack_top + 1] = i$valstack[i$valstack_base + 18];
  i$SLIDE(2);
  i$valstack_top = i$valstack_base + 2;
  i$CALL(_idris__123_APPLY_95_0_125_,[oldbase]);
}
var i$CON$0 = new i$CON(0,[],null,null);
var i$CON$1 = new i$CON(1,[],null,null);
var i$CON$2 = new i$CON(2,[],null,null);
var i$CON$5 = new i$CON(5,[],null,null);
var i$CON$65683 = new i$CON(65683,[],_idris__123_APPLY_95_0_125_$65683,null);
var i$CON$65692 = new i$CON(65692,[],_idris__123_APPLY_95_0_125_$65692,null);
var i$CON$65693 = new i$CON(65693,[],_idris__123_APPLY_95_0_125_$65693,null);
var i$CON$65694 = new i$CON(65694,[],_idris__123_APPLY_95_0_125_$65694,null);
var i$CON$65695 = new i$CON(65695,[],_idris__123_APPLY_95_0_125_$65695,null);
var i$CON$65696 = new i$CON(65696,[],_idris__123_APPLY_95_0_125_$65696,null);
var i$CON$65697 = new i$CON(65697,[],_idris__123_APPLY_95_0_125_$65697,null);
var i$CON$65698 = new i$CON(65698,[],_idris__123_APPLY_95_0_125_$65698,null);
var i$CON$65699 = new i$CON(65699,[],_idris__123_APPLY_95_0_125_$65699,null);
var i$CON$65702 = new i$CON(65702,[],_idris__123_APPLY_95_0_125_$65702,null);
var i$CON$65703 = new i$CON(65703,[],_idris__123_APPLY_95_0_125_$65703,null);
var i$CON$65704 = new i$CON(65704,[],_idris__123_APPLY_95_0_125_$65704,null);
var i$CON$65705 = new i$CON(65705,[],_idris__123_APPLY_95_0_125_$65705,null);
var i$CON$65706 = new i$CON(65706,[],_idris__123_APPLY_95_0_125_$65706,null);
var i$CON$65710 = new i$CON(65710,[],_idris__123_APPLY_95_0_125_$65710,null);
var i$CON$65713 = new i$CON(65713,[],_idris__123_APPLY_95_0_125_$65713,null);
var i$CON$65714 = new i$CON(65714,[],_idris__123_APPLY_95_0_125_$65714,null);
var i$CON$65715 = new i$CON(65715,[],_idris__123_APPLY_95_0_125_$65715,null);
var i$CON$65716 = new i$CON(65716,[],_idris__123_APPLY_95_0_125_$65716,null);
var i$CON$65717 = new i$CON(65717,[],_idris__123_APPLY_95_0_125_$65717,null);
var i$CON$65719 = new i$CON(65719,[],_idris__123_APPLY_95_0_125_$65719,null);
var i$CON$65720 = new i$CON(65720,[],_idris__123_APPLY_95_0_125_$65720,null);
var i$CON$65722 = new i$CON(65722,[],_idris__123_APPLY_95_0_125_$65722,null);
var i$CON$65723 = new i$CON(65723,[],_idris__123_APPLY_95_0_125_$65723,null);
var i$CON$65724 = new i$CON(65724,[],_idris__123_APPLY_95_0_125_$65724,null);
var i$CON$65725 = new i$CON(65725,[],_idris__123_APPLY_95_0_125_$65725,null);
var i$CON$65726 = new i$CON(65726,[],_idris__123_APPLY_95_0_125_$65726,null);
var i$CON$65727 = new i$CON(65727,[],_idris__123_APPLY_95_0_125_$65727,null);
var i$CON$65728 = new i$CON(65728,[],_idris__123_APPLY_95_0_125_$65728,null);
var i$CON$65729 = new i$CON(65729,[],_idris__123_APPLY_95_0_125_$65729,null);
var i$CON$65730 = new i$CON(65730,[],_idris__123_APPLY_95_0_125_$65730,null);
var i$CON$65732 = new i$CON(65732,[],_idris__123_APPLY_95_0_125_$65732,null);
var i$CON$65736 = new i$CON(65736,[],_idris__123_APPLY_95_0_125_$65736,null);
var main = function(){
if (typeof (document) != "undefined" && (document.readyState == "complete" || document.readyState == "loaded")) {
    var vm = new i$VM();
    i$SCHED(vm);
    _idris__123_runMain_95_0_125_(new i$POINTER(0));
    i$RUN();
  } else if (typeof (window) != "undefined") {
    window.addEventListener("DOMContentLoaded",function(){
  var vm = new i$VM();
  i$SCHED(vm);
  _idris__123_runMain_95_0_125_(new i$POINTER(0));
  i$RUN();
}
,false);
  } else if (true) {
    var vm = new i$VM();
    i$SCHED(vm);
    _idris__123_runMain_95_0_125_(new i$POINTER(0));
    i$RUN();
  }
}
main()