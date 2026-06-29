// Fixtures.gs — real Amazon email bodies from the validated mbox.
// Used by runAgainstFixtures() to test the full pipeline WITHOUT Gmail access.
// Each covers a distinct attribution path. Do not edit the bodyText — these are
// ground-truth samples; the ported logic must produce correct line items from them.

const TEST_FIXTURES = [
  // === single_order_shipped ===
  {
    messageId: "<0100019efe14fc7f-5614e162-805d-4aad-ba87-939dde8db5f9-000000@email.amazonses.com>",
    senderEmail: "shipment-tracking@amazon.com",
    subject: "Shipped: 20 \"SUNLU High Speed PETG...\"",
    date: "Thu, 25 Jun 2026 09:20:48 +0000",
    caseType: "single_order_shipped",
    bodyText: `Your Orders

https://www.amazon.com/gp/css/order-history?ref_=fed_yo_default

Prime Day Deals

https://www.amazon.com/primeday?ref_=fed_pd_default

Buy Again

https://www.amazon.com/gp/buyagain?ref_=fed_bia_default


    Your package was shipped!
Ordered

Shipped

Out for delivery

Delivered










Arriving today



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-0883936-7334632



Track package
https://www.amazon.com/progress-tracker/package?_encoding=UTF8&orderId=113-0883936-7334632&packageIndex=0&shipmentId=Nvb2Wpw4N&vt=NOTIFICATIONS&ref_=p_btn_fed_track_package

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 1
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 3
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 2
  42.99 USD


Total
943.6 USD


View related transactions in Your Transactions
https://www.amazon.com/cpe/yourpayments/transactions?transactionTag=113-0883936-7334632&ref_=fed_sce_yt.A delivery driver may contact you on the day of delivery. For everyone’s safety, ensure a clear, well-lit path and secure pets before arrival.



alexa-blue-heron-order

https://www.amazon.com/gp/css/order-history?rufus-height=expanded&rufus-payload=%7B%22qis%22%3A%22NileIngressOutboundMarketing%22%2C%22actionType%22%3A%22SEARCH%22%7D&rufus-query=Help%20me%20with%20my%20recent%20purchase&rufus-client=rufusMarketing&rufus-action=CategoryRedirect&ref_=ashop_eml_bn_BH_trans


©2026 Amazon.com, Inc. or its affiliates. Amazon and all related marks are trademarks of Amazon.com, Inc. or its affiliates, Amazon.com, Inc. 410 Terry Avenue N., Seattle, WA 98109.

Your invoice can be accessed [here.](https://www.amazon.com/gp/css/summary/print.html?orderID=113-0883936-7334632&ref_=fed_tlt_default_inv) One or more items in your shipment was supplied by a different seller than the seller you purchased the item from. Visit [Your Orders](https://www.amazon.com/gp/css/order-history?ie=UTF8&ref_=fed_tlt_default_cl) from a web browser to see the suppliers of these items on your invoices. Items in this shipment may be subject to California's Electronic Waste Recycling Act. For any items not sold by Amazon.com or Amazon Digital Services, Inc. that are subject to that Act, the seller of that item is responsible for submitting the California Electronic Waste Recycling fees on your behalf. Unless otherwise noted, items sold by Amazon are subject to sales tax in selected states or provinces in accordance with the applicable laws of that state. If your order contains one or more items from a seller other than Amazon, it may be subject to local and state or province tax, depending upon the sellers business policies and the location of their operations. For more information, go to [tax and seller information](https://www.amazon.com/gp/help/customer/display.html/ref=fed_tlt_default_sba?ie=UTF8&nodeId=200962600).

Amazon.com`
  },
  // === zero_marker_delivered ===
  {
    messageId: "<0100019f00781ee6-fde74790-ca79-416b-8592-6085416fb09e-000000@email.amazonses.com>",
    senderEmail: "order-update@amazon.com",
    subject: "Delivered: \"SUNLU High Speed PETG...\"",
    date: "Thu, 25 Jun 2026 20:28:20 +0000",
    caseType: "zero_marker_delivered",
    bodyText: `Your Orders

https://www.amazon.com/gp/css/order-history?ref_=fed_yo_default

Prime Day Deals

https://www.amazon.com/primeday?ref_=fed_pd_default

Buy Again

https://www.amazon.com/gp/buyagain?ref_=fed_bia_default


    Your package was delivered!

















Delivered today

It was handed directly to a receptionist or someone at a front desk.

Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-0883936-7334632



Track package
https://www.amazon.com/progress-tracker/package?_encoding=UTF8&orderId=113-0883936-7334632&packageIndex=0&shipmentId=NsVsVPWXN&vt=NOTIFICATIONS&ref_=p_btn_fed_track_package

* SUNLU High Speed PETG Filament 1.75mm 4KG Bundle, 3D Printer Filament 4kg, 1kg per Spool, Pack of 4, 4 Colors, PETG Black *4 Pack
  Quantity: 1



Return or replace items in Your Orders
https://www.amazon.com/your-orders/orders?ref_=pdc_yo.



©2026 Amazon.com, Inc. or its affiliates. Amazon and all related marks are trademarks of Amazon.com, Inc. or its affiliates, Amazon.com, Inc. 410 Terry Avenue N., Seattle, WA 98109.

Amazon.com`
  },
  // === multi_order_summary ===
  {
    messageId: "<0100019ecee34015-f5ef32de-4e49-4960-95cd-368b9e2a046d-000000@email.amazonses.com>",
    senderEmail: "auto-confirm@amazon.com",
    subject: "Ordered: 2 \"XHF 500 PCS 3/4\" Black Self...\" and 339 more items",
    date: "Tue, 16 Jun 2026 05:24:20 +0000",
    caseType: "multi_order_summary",
    bodyText: `Your Orders

https://www.amazon.com/gp/css/order-history?ref_=fed_yo_default

Your Account

https://www.amazon.com/your-account?ref_=fed_ya_default

Buy Again

https://www.amazon.com/gp/buyagain?ref_=fed_bia_default


    Thanks for your order!
Ordered

Shipped

Out for delivery

Delivered










Arriving June 22



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-4103435-6198614



View or edit order
https://www.amazon.com/your-orders/order-details?orderID=113-4103435-6198614&ref_=p_btn_fed_veo

* Hosyond 5 Pcs 0.91 Inch I2C OLED Display Module IIC OLED Screen DC 3.3V~5V Compatible with Arduino Raspberry PI (White Display Color)
  Quantity: 20
  12.88 USD

Arriving tomorrow



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-4103435-6198614



View or edit order
https://www.amazon.com/your-orders/order-details?orderID=113-4103435-6198614&ref_=p_btn_fed_veo

* ELEGOO 120pcs Multicolored Dupont Wire 40pin Male to Female, 40pin Male to Male, 40pin Female to Female Breadboard Jumper Ribbon Cables Kit Compatible with Arduino Projects
  Quantity: 1
  6.88 USD

Arriving Wednesday



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-4103435-6198614



View or edit order
https://www.amazon.com/your-orders/order-details?orderID=113-4103435-6198614&ref_=p_btn_fed_veo

* Easycargo 30mm Fan 5V 3.3V DC Quiet Fan for Raspberry Pi 5 4 3B+ 3007 (4-Sets)
  Quantity: 25
  9.75 USD

Arriving June 22



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-4103435-6198614



View or edit order
https://www.amazon.com/your-orders/order-details?orderID=113-4103435-6198614&ref_=p_btn_fed_veo

* Adaptermvp USB 2.0 Adapter, Dual USB Female Jack Y Splitter Charger Cable (2 Pack) for Laptop/Tablet/Smartphone Data Transmission/Charging
  Quantity: 100
  4.79 USD

Arriving tomorrow



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-4103435-6198614



View or edit order
https://www.amazon.com/your-orders/order-details?orderID=113-4103435-6198614&ref_=p_btn_fed_veo

* XHF 500 PCS 3/4" Black Self Adhesive Cable Zip Tie Mounts Wire Cable Clips Holders Management Anchors Organizer Holders Squares(HS-101S)
  Quantity: 2
  26.59 USD


Grand Total:
1127.93 USD



Order received



Lane - Mountain View, CA - On behalf of Actor Labs

Order #
113-3688270-9185012



View or edit order
https://www.amazon.com/your-orders/order-details?orderID=113-3688270-9185012&ref_=p_btn_fed_veo

* MIAOERJING SATA to USB 3.0 Cable, USB to SATA III Hard Drive Adapter for 2.5 Inch SSD & HDD Data Transfer, Support UASP (SATA to Type-A)
  Quantity: 100
  5.99 USD

* 2Pcs 24V / 12V to 5V 5A Power Buck Converter DC-DC Power Down Module Voltage Regulator Adjustable USB Step-Down Charging Module
  Quantity: 47
  7.35 USD

* Electrical Box, 2PCS Outdoor Waterproof Box IP65 Junction Box with Reserved Holes,ABS Plastic Project Box Power Cord Enclosure Black 5.9 x 4.3 x 2.8 inch(150x110x70mm)
  Quantity: 46
  16.14 USD


Grand Total:
1850.95 USD




re-opt-in-exp-pdlu-2206

https://www.amazon.com/preferences/gss/reengage?ref_=reoptin_t1


©2026 Amazon.com, Inc. or its affiliates. Amazon and all related marks are trademarks of Amazon.com, Inc. or its affiliates, Amazon.com, Inc. 410 Terry Avenue N., Seattle, WA 98109.

The payment for your invoice is processed by Amazon Payments, Inc. P.O. Box 81226 Seattle, Washington 98108-1226. If you need more information, please contact (866) 216-1075 By placing your order, you agree to Amazon.com’s [Privacy Notice](https://www.amazon.com/gp/help/customer/display.html?ie=UTF8&nodeId=468496&ref_=fed_roclt_default_policy) and [ Conditions of Use](https://www.amazon.com/gp/help/customer/display.html?ie=UTF8&nodeId=508088&ref_=fed_roclt_default_policy). Unless otherwise noted, items sold by Amazon.com are subject to sales tax in select states in accordance with the applicable laws of that state. If your order contains one or more items from a seller other than Amazon.com, it may be subject to state and local sales tax, depending upon the seller's business policies and the location of their operations. Learn more about [tax and seller information](https://www.amazon.com/gp/help/customer/display.html?ie=UTF8&nodeId=202029700&ref_=fed_roclt_default_policy). Items in this order may be subject to California's Electronic Waste Recycling Act. If any items in this order are subject to that Act, the seller of that item has elected to pay any fees due on your behalf.

Amazon.com`
  },
  // === focused_orderhash ===
  {
    messageId: "<0100019e51ca0aca-cf52ec43-289f-4191-bf27-ca7a14ae3cf3-000000@email.amazonses.com>",
    senderEmail: "auto-confirm@amazon.com",
    subject: "Your Amazon.com order of \"NeoWire Heat Shrink Tubing...\" and 3 more\r\n items.",
    date: "Fri, 22 May 2026 22:24:16 +0000",
    caseType: "focused_orderhash",
    bodyText: `Amazon.com Order Confirmation
Order #111-8707019-6565045
Order #111-5020365-2985850
www.amazon.com/ref=TE_tex_h
_______________________________________________________________________________________

Hello Lane Burgett,

Thank you for shopping with us. We’ll send a confirmation once your items have shipped.
 Your order details are indicated below. If you would like to view the status of your order or make any changes to it, please visit Your Orders on Amazon.com at:
https://www.amazon.com/gp/css/your-orders-access/ref=TE_gs


This order is placed on behalf of Actor Labs.
=======================================================================================

Order Details
Order #111-8707019-6565045
Placed on today, May 22

     Your guaranteed delivery date is:
               Tuesday, May 26

                
     Your shipping speed:
               FREE Prime Delivery

     Your order will be sent to:
               Lane Burgett
               Mountain View, CA
               United States


               NeoWire Heat Shrink Tubing 1" (25.4mm), 3:1 Ratio Shrink Tube Industrial and Marine Grade, Dual Wall Adhesive Lined Wire Shrink Wrap Tubing, 29 Feet Roll
               $33.99

               Sold by: Tube Store

               Condition: New

               Bond It Rescue Tape, Self-Fusing Silicone Tape, Emergency Plumbing Pipe & Radiator Hose Repair, Electrical Insulation, Waterproof, 950PSI, 1" Width x 36' Length x 0.02" Thick, Black
               $24.98

               Sold by: Enovations

               Condition: New


_______________________________________________________________________________________


              Order Total: $64.72


The payment details of your transaction can be found on the order invoice at:
https://www.amazon.com/gp/css/summary/print.html/ref=TE_oi?ie=UTF8&orderID=111-8707019-6565045

=======================================================================================

Order #111-5020365-2985850
Placed on today, May 22

     Your estimated delivery date is:
               Wednesday, May 27- Thursday, May 28 
                
     Your shipping speed:
               Standard Shipping

     Your order will be sent to:
               Lane Burgett
               Mountain View, CA
               United States


               2 x PATIKIL Silicone O-Ring 53mm OD 47mm ID 3mm Width, 30Pcs Metric VMQ Sealing Gasket Replacement for Plumbing Compressor Valves Repair, Red
               $7.90

               Sold by: PATIKIL US

               Condition: New


_______________________________________________________________________________________


              Order Total: $17.34


The payment details of your transaction can be found on the order invoice at:
https://www.amazon.com/gp/css/summary/print.html/ref=TE_oi?ie=UTF8&orderID=111-5020365-2985850

=======================================================================================

To learn more about ordering, go to Ordering from Amazon.com at:
www.amazon.com/gp/help/customer/display.html/ref=TE_tex_ofa?nodeId=468466

If you want more information or need more assistance, go to Help at:
www.amazon.com/gp/help/customer/display.html/ref=TE_tex_ss?ie=UTF8&nodeId=508510

Thank you for shopping with us.
Amazon.com
www.amazon.com/ref=TE_tex_ty
_______________________________________________________________________________________

The payment for your invoice is processed by Amazon Payments, Inc. P.O. Box 81226 Seattle, Washington 98108-1226. If you need more information, please contact (866) 216-1075

Unless otherwise noted, items sold by Amazon.com are subject to sales tax in select states in accordance with the applicable laws of that state. If your order contains one or more items from a seller other than Amazon.com, it may be subject to state and local sales tax, depending upon the seller's business policies and the location of their operations. Learn more about tax and seller information at:
https://www.amazon.com/gp/help/customer/display.html/ref=hp_bc_nav?ie=UTF8&nodeId=202029700

Items in this order may be subject to California's Electronic Waste Recycling Act. If any items in this order are subject to that Act, the seller of that item has elected to pay any fees due on your behalf.

This email was sent from a notification-only address that cannot accept incoming email. Please do not reply to this message.`
  },
];
