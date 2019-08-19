import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from "./guards/guard.auth";
import { LocationComponent } from './location/location.component'
import { OrdersComponent } from './orders/orders.component'

const routes: Routes = [
  { path: 'browse/:id', canActivate: [AuthGuard], component: LocationComponent },
  { path: 'browse', redirectTo: 'browse/0', pathMatch: 'full' },
  { path: 'orders', component: OrdersComponent },
  { path: '', children: [] },
  { path: '**', redirectTo: '/', pathMatch: 'full'}
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { enableTracing: false })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
