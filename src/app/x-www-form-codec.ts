import { HttpUrlEncodingCodec, HttpParameterCodec } from '@angular/common/http';

export class X_WWW_FORM_UrlEncodingCodec implements HttpParameterCodec {

  static hook(): void {
    HttpUrlEncodingCodec.prototype.decodeKey = X_WWW_FORM_UrlEncodingCodec.prototype.decodeKey;
    HttpUrlEncodingCodec.prototype.encodeKey = X_WWW_FORM_UrlEncodingCodec.prototype.encodeKey;
    HttpUrlEncodingCodec.prototype.decodeValue = X_WWW_FORM_UrlEncodingCodec.prototype.decodeValue;
    HttpUrlEncodingCodec.prototype.encodeValue = X_WWW_FORM_UrlEncodingCodec.prototype.encodeValue;
  }

  private static encode(v: string): string {
    return encodeURIComponent(v).replace(/%20/gi, '+');
  }

  private static decode(v: string): string {
    return decodeURIComponent(v.replace(/\\+/gi, '%20'));
  }

  encodeKey(key: string): string {
    return X_WWW_FORM_UrlEncodingCodec.encode(key);
  }
  encodeValue(value: string): string {
    return X_WWW_FORM_UrlEncodingCodec.encode(value);
  }
  decodeKey(key: string): string {
    return X_WWW_FORM_UrlEncodingCodec.decode(key);
  }
  decodeValue(value: string): string {
    return X_WWW_FORM_UrlEncodingCodec.decode(value);
  }
}

