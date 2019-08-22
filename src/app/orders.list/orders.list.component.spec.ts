import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { Orders.ListComponent } from './orders.list.component';

describe('Orders.ListComponent', () => {
  let component: Orders.ListComponent;
  let fixture: ComponentFixture<Orders.ListComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ Orders.ListComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(Orders.ListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
