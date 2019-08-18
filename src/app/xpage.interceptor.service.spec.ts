import { TestBed } from '@angular/core/testing';

import { Xpage.InterceptorService } from './xpage.interceptor.service';

describe('Xpage.InterceptorService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: Xpage.InterceptorService = TestBed.get(Xpage.InterceptorService);
    expect(service).toBeTruthy();
  });
});
