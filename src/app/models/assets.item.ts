
export class AssetsItem {
    typeName: string;                // type name for item type_id
    comment: string | undefined;     // user name for item
    quantity: number | undefined;    // item's quantity
    value: number;                   // item's total value (including content)
    volume: number | undefined;      // item's volume
    locaton_id: number | undefined;  // item itself is a location
}
