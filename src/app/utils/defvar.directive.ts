import { Directive, OnInit, Input, TemplateRef, ViewContainerRef } from '@angular/core';

// *defVar="value as name"
// => [defVar]="value" let-name="defVar"

// Directive's context
interface Context<T> {
  defVar: T | undefined;
}

@Directive({
  selector: '[defVar]'
})
export class DefVarDirective<T> implements OnInit {
  private _c: Context<T> = { defVar: undefined };

  constructor(private viewContainerRef: ViewContainerRef, private templateRef: TemplateRef<Context<T>>) {}

  ngOnInit(): void {
    this.viewContainerRef.createEmbeddedView(this.templateRef, this._c);
  }

  @Input()
  set defVar(value: T) {
    this._c.defVar = value;
  }
}
