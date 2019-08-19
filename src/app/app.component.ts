import { Component } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { EVESSOService } from './services/EVESSO.service';

import ru from '@angular/common/locales/ru';

import ccpCopyright from '../assets/ccp.copyright.json';

@Component({
  selector: 'app-root',
  styleUrls: ['./app.component.css'],
  templateUrl: './app.component.html',
})
export class AppComponent {

  public readonly copyright: string;

  get charData()
  {
    return this.sso.charData;
  }

  constructor(private sso: EVESSOService) {
    this.copyright = ccpCopyright.split('{site}').join(window.location.hostname);
    this.sso.configure();
    this.sso.tryLogin();
  }

  ngOnInit() {
    registerLocaleData(ru);
  }  

  ngAfterViewInit() {
  }

  login() {
    this.sso.login();
  }

  logoff() {
    this.sso.logout();
  }
 
  isLoggedIn(): boolean {
    return this.sso.isLoggedIn();
  }  
  
}
