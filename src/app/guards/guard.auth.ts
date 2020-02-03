
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EVESSOService } from '.././services/EVESSO.service';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router, private sso: EVESSOService) { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    return this.sso.isLoggedIn() ? true : this.router.parseUrl('/unauthorized');
  }
}
