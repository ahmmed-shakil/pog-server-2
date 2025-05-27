import prisma from '../config/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sendDataToDb = async (response: any) => {
  try {
    for (const orderData of response) {
      // console.log('🚀 ~ sendDataToDb ~ orderData:', orderData);
      const { Order, OrderItem } = orderData;
      if (!Order?.id) {
        console.log(`Skippingn Order as order_id not found`);
        return;
      }
      const checkOrderExists = await prisma.order.findUnique({ where: { order_id: Order?.id?.toString() } });
      if (checkOrderExists) {
        console.log(`Skipping Order as order_id already exists`);
        return;
      }

      // Validate and filter OrderItems
      let array = await Promise.all(
        OrderItem.map(async (item: any) => {
          if (!item.item_extra_data) {
            console.log(`Skipping OrderItem due to missing extra data: ${item.item_id}`);
            return;
          }

          // Create Restaurant
          let findRestaurant = await prisma.new_restaurant.findUnique({ where: { restaurant_id: parseInt(item.restaurant_id) } });
          let createRestaurant;
          if (!findRestaurant) {
            createRestaurant = await prisma.new_restaurant.create({ data: { restaurant_id: parseInt(item.restaurant_id) } });
          }

          const restaurantId = findRestaurant?.restaurant_id || createRestaurant?.restaurant_id;
          if (!restaurantId) {
            throw new Error('Restaurant ID is undefined');
          }

          const itemExistsById = await prisma.restaurant_new_SKU_items.findFirst({
            where: {
              restaurant_id: restaurantId,
              item_id: parseInt(item.item_id),
              restaurant_new_SKU_group: {
                group_category_id: parseInt(item?.group_category_id),
              },
            },
          });
          const itemExistsByName = await prisma.restaurant_new_SKU_items.findFirst({
            where: {
              restaurant_id: restaurantId,
              name: item.name,
              restaurant_new_SKU_group: {
                group_category_id: parseInt(item?.group_category_id),
              },
            },
          });
          let createItem = null;
          if (itemExistsById || itemExistsByName) {
            const existingItem = itemExistsById || itemExistsByName;
            if (existingItem && parseInt(item.price) !== existingItem.price) {
              await prisma.restaurant_new_SKU_items.update({
                where: { id: existingItem.id },
                data: {
                  price: parseInt(item.price),
                },
              });
            }
          }
          if (!itemExistsById && !itemExistsByName) {
            const item_extra_data = JSON.parse(item.item_extra_data);
            if (!item_extra_data) {
              return;
            }
            // Create Restaurant
            let findRestaurant = await prisma.new_restaurant.findUnique({ where: { restaurant_id: parseInt(item.restaurant_id) } });
            let createRestaurant;
            if (!findRestaurant) {
              createRestaurant = await prisma.new_restaurant.create({ data: { restaurant_id: parseInt(item.restaurant_id) } });
            }
            const restaurantId = findRestaurant?.restaurant_id || createRestaurant?.restaurant_id;
            if (!restaurantId) {
              throw new Error('Restaurant ID is undefined');
            }

            // Create Group
            const findGroupById = await prisma.restaurant_new_SKU_group.findFirst({ where: { restaurant_id: restaurantId, group_category_id: parseInt(item.group_category_id) } });
            const findGroupByName = await prisma.restaurant_new_SKU_group.findFirst({ where: { restaurant_id: restaurantId, group_name: item_extra_data.g_name } });
            let createGroup;
            if (!findGroupById && !findGroupByName) {
              createGroup = await prisma.restaurant_new_SKU_group.create({
                data: { group_category_id: parseInt(item.group_category_id), group_name: item_extra_data.g_name, restaurant_id: restaurantId },
              });
              // console.log('🚀 ~ orderData.OrderItem.map ~ createGroup:', createGroup);
            }

            // Create restaurant_new_SKU_category
            const findCategoryById = await prisma.restaurant_new_SKU_category.findFirst({ where: { restaurant_id: restaurantId, category_id: parseInt(item_extra_data.c_id) } });
            const findCategoryByName = await prisma.restaurant_new_SKU_category.findFirst({ where: { restaurant_id: restaurantId, category_name: item_extra_data.c_name } });
            let createCategory;
            if (!findCategoryById && !findCategoryByName) {
              createCategory = await prisma.restaurant_new_SKU_category.create({
                data: { category_id: parseInt(item_extra_data.c_id), category_name: item_extra_data.c_name, restaurant_id: restaurantId },
              });
              // console.log('🚀 ~ orderData.OrderItem.map ~ createCategory:', createCategory);
            }

            // Create restaurant_new_SKU_variants
            let checkVarientExists;
            let createVarient;
            if (item_extra_data.v_id !== 0) {
              checkVarientExists = await prisma.restaurant_new_SKU_variants.findFirst({ where: { variant_id: parseInt(item_extra_data.v_id) } });
              if (!checkVarientExists) {
                const variant = { variant_id: parseInt(item_extra_data.v_id), variant_name: item_extra_data.v_name };
                createVarient = await prisma.restaurant_new_SKU_variants.create({ data: variant });
              }
            }
            //Create  Item
            createItem = prisma.restaurant_new_SKU_items.create({
              data: {
                item_id: parseInt(item.item_id),
                price: parseFloat(item.price),
                ncFlag: parseInt(item.price) === 0 ? true : false,
                name: item.name,
                restaurant_id: restaurantId,
                old_item_id: parseInt(item.old_item_id),
                i_s_name: item_extra_data.i_s_name,
                category_id: findCategoryById?.id || findCategoryByName?.id || createCategory?.id,
                group_category_id: findGroupById?.id || findGroupByName?.id || createGroup?.id,
                variant_id: checkVarientExists?.id || createVarient?.id,
              },
            });
          }

          return {
            item_id: itemExistsById?.id || itemExistsByName?.id || (await createItem)?.id,
            quantity: parseFloat(item.quantity),
            // quantity: item?.quantity,
            // quantity: item.quantity ? Number(item.quantity) || 0 : 0,
            price: parseFloat(item.price),
            original_price: parseFloat(item.original_price),
            total: parseFloat(item.total),
            total_discount: parseFloat(item.total_discount),
            total_tax: parseFloat(item.total_tax),
            restaurantID: restaurantId,
            createdAt: new Date(Order.created),
            packingCharge: parseFloat(item.packing_charge),
            NCFlag: parseInt(item.price) === 0 ? true : false,
          };
        })
      );
      if (array.length < 0) {
        throw new Error('No arrayy');
      }
      array = array.filter(item => {
        return item !== null && item !== undefined;
      });

      let find_order_payment_type;
      const paymentType = await Order.payment_type.toString();
      if (paymentType === '1' || paymentType === '2' || paymentType === '3' || paymentType === '9') {
        find_order_payment_type = await prisma.order_payment_type.findFirst({ where: { id: '1' } });
      } else {
        find_order_payment_type = await prisma.order_payment_type.findFirst({ where: { id: paymentType } });
      }

      // Find order
      let new_order_type;
      const orderType = await Order.order_type.toString();
      if (orderType === '1' || orderType === '2') {
        new_order_type = await prisma.new_order_type.findFirst({ where: { id: '1' } });
      } else {
        new_order_type = await prisma.new_order_type.findFirst({ where: { id: orderType } });
      }

      let restaurant_area;
      restaurant_area = await prisma.restaurant_area.findFirst({ where: { id: Order.restaurant_area_id.toString() } });
      if (!restaurant_area) {
        restaurant_area = await prisma.restaurant_area.create({ data: { id: Order.restaurant_area_id.toString() } });
      }
      if (!restaurant_area) {
        return; // Optionally add an error response or log here
      }
      if (!find_order_payment_type) {
        return; // Optionally add an error response or log here
      }

      if (!new_order_type) {
        return; // Optionally add an error response or log here
      }
      // Create Order
      const createdOrder = await prisma.order.create({
        data: {
          order_id: Order?.id?.toString(),
          restaurant_id: parseInt(Order.restaurant_id),
          invoice_id: parseInt(Order.invoice_id),
          restaurant_area_id: restaurant_area.id,
          order_payment_type_id: find_order_payment_type.id,
          new_order_type_id: new_order_type?.id,
          created_at: new Date(Order.created),
          payment_status: Order.payment_confirmation,
          // cancel_reason: Order.cancel_order_description || null,
          cancel_reason: Order?.cancel_order_description,
          order_amount: parseFloat(Order.core_price),
          discount: parseFloat(Order.discount),
          net_amount_after_discount: parseFloat(Order.total),
          packing_charge: parseFloat(Order.packing_charge),
          delivery_charges: parseFloat(Order.delivery_charge),
          service_charges: parseFloat(Order.service_charge),
          total_tax: parseFloat(Order.tax),
          total_amount: parseFloat(Order.total),
          non_taxable_amount: parseFloat(Order.old_total),
          CGST: parseFloat(Order.tax),
          SGST: parseFloat(Order.tax),
          VAT: parseFloat(Order.tax),
          table_no: parseFloat(Order.table_no),
          custom_payment_type: Order.custom_payment_type,
          payment_type: parseFloat(Order.payment_type),
          OrderItem: {
            create: array.map((item: any) => item),
          },
        },
      });

      // console.log('🚀 ~ sendDataToDb ~ createdOrder:', createdOrder);
    }
    return true;
  } catch (error) {
    // console.error('Error sending data to DB:', error);
    return false; // Return false if there's an error
  }
};
