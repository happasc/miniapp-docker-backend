import sys
import re

with open('c:/Users/ASUS/Desktop/Wminiapp-PWS/miniapp/miniprogram/pages/game-detail/game-detail.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

handled_create_order_new = """handleCreateOrder() {
    const authState = app && typeof app.getAuthState === 'function' ? app.getAuthState() : { loggedIn: false }
    if (!authState.loggedIn) {
      wx.showModal({
        title: '请先登录',
        content: '下单前需要先完成微信登录，是否前往登录？',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.reLaunch({ url: '/pages/index/index?tab=me' })
          }
        }
      })
      return;
    }

    if (this.data.status !== 'available') {
      wx.showToast({ title: '该服务暂未开放下单', icon: 'none' })
      return;
    }

    const selectedOption = findOptionByKey(this.data.sections, this.data.selectedOptionKey)
    if (!selectedOption) {
      wx.showToast({ title: '请先选择服务档位', icon: 'none' })
      return;
    }

    let hasAddon = false;
    let addonLabel = '';
    let parsedAddonPrice = 0;
    if (selectedOption.extra) {
       const matchAddon = selectedOption.extra.match(/([^\+]+)\+([\d\.]+)元/)
       if (matchAddon) {
         hasAddon = true;
         addonLabel = matchAddon[1].trim()
         parsedAddonPrice = parseFloat(matchAddon[2])
       }
    }

    const skuPrices = selectedOption.parsedPrices || [];
    const firstSku = skuPrices[0] || { price: 0, unit: '次', tierName: '' };

    this.setData({
      showOrderModal: true,
      skuPrices: skuPrices,
      currentPrice: firstSku.price,
      currentUnit: firstSku.unit,
      currentTier: firstSku.tierName,
      hasAddonOption: hasAddon,
      addonLabel: addonLabel || '附加服务',
      addonPrice: parsedAddonPrice,
      buyQuantity: 1,
      enableAddon: false
    });

    this.calculateTotal();
  },"""

js_content = re.sub(r'handleCreateOrder\(\) \{[\s\S]*?\},', handled_create_order_new, js_content, count=1)

switch_billing_mode_new = """switchBillingMode(e) {
    const dataset = e.currentTarget.dataset;
    const price = parseFloat(dataset.price) || 0;
    const tier = dataset.tier || '';
    const unit = dataset.unit || '次';

    if (this.data.currentTier === tier) return;

    this.setData({
      currentPrice: price,
      currentUnit: unit,
      currentTier: tier,
      buyQuantity: 1
    });

    this.calculateTotal();
  },"""

js_content = re.sub(r'switchBillingMode\s*\([^)]*\)\s*\{[^}]*\},', switch_billing_mode_new, js_content, count=1)


with open('c:/Users/ASUS/Desktop/Wminiapp-PWS/miniapp/miniprogram/pages/game-detail/game-detail.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Updated js successfully")
