import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LocationComponent } from './location/location.component'

const routes: Routes = [
  { path: ':id', component: LocationComponent },
  //{ path: '', component: LocationComponent },
  { path: '', redirectTo: '0', pathMatch: 'full' },
  { path: '**', redirectTo: '/', pathMatch: 'full'}
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { enableTracing: false })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
