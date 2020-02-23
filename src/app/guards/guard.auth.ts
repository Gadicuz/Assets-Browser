import { Injectable } from '@angular/core';
import { EVESSOService } from '../services/eve-sso/eve-sso.module';
import { Router, CanActivate, UrlTree } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router, private sso: EVESSOService) {}

  canActivate(/*_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot */): boolean | UrlTree {
    return this.sso.isLoggedIn() ? true : this.router.parseUrl('/unauthorized');
  }
}
