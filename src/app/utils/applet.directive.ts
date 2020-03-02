import { Directive, OnInit, Input, TemplateRef, ViewContainerRef } from '@angular/core';

// *appLet="value as var"
// => [appLet]="value" let-var="appLet"

// Directive's context
interface AppLetContext<T> {
  appLet: T | undefined;
}

@Directive({
  selector: '[appLet]'
})
export class AppLetDirective<T> implements OnInit {
  private _c: AppLetContext<T> = { appLet: undefined };

  constructor(private viewContainerRef: ViewContainerRef, private templateRef: TemplateRef<AppLetContext<T>>) {}

  ngOnInit(): void {
    this.viewContainerRef.createEmbeddedView(this.templateRef, this._c);
  }

  @Input()
  set appLet(value: T) {
    this._c.appLet = value;
  }
}
