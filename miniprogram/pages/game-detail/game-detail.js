const app = getApp()
const { getServiceDetail } = require('../../data/service-catalog')
const { createPendingOrder } = require('../../utils/order-store')

function prepareSections(sections) {
  return (sections || []).map((section, sectionIndex) => ({
    title: section.title,
    description: section.description,
    items: (section.items || []).map((option, optionIndex) => {
      const parsedPrices = (option.prices || []).map(priceStr => {
        let price = 0;
        let tierName = option.label || '';
        let unit = '次';
        const match = priceStr.match(/^(.*?)\s*([\d\.]+)元\/?(.*)$/);
        if (match) {
          const prefix = match[1].trim();
          if (prefix) tierName += ' - ' + prefix;
          price = parseFloat(match[2]);
          unit = match[3].trim() || '次';
        } else {
          const fallback = priceStr.match(/([\d\.]+)/);
          if (fallback) price = parseFloat(fallback[1]);
          tierName += ' - ' + priceStr;
        }
        return {
          original: priceStr,
          tierName: tierName,
          price: price,
          unit: unit
        };
      });

      return {
        label: option.label,
        prices: option.prices || [],
        parsedPrices: parsedPrices,
        extra: option.extra || '',
        badge: option.badge || '',
        optionKey: sectionIndex + '-' + optionIndex,
        sectionTitle: section.title,
        activeClass: ''
      };
    })
  }))
}

function applySelectionToSections(sections, selectedOptionKey) {
  return (sections || []).map((section) => ({
    title: section.title,
    description: section.description,
    items: (section.items || []).map((option) => ({
      label: option.label,
      prices: option.prices || [],
      parsedPrices: option.parsedPrices || [],
      extra: option.extra || '',
      badge: option.badge || '',
      optionKey: option.optionKey,
      sectionTitle: option.sectionTitle,
      activeClass: option.optionKey === selectedOptionKey ? 'price-card-active' : ''
    }))
  }))
}

function prepareAppendix(appendix) {
  if (!appendix) return null

  return {
    title: appendix.title || '',
    items: (appendix.items || []).map((note, index) => ({
      label: (index + 1) + '. ' + note
    }))
  }
}

function findOptionByKey(sections, optionKey) {
  let matchedOption = null
  ;(sections || []).some((section) => {
    return (section.items || []).some((option) => {
      if (option.optionKey === optionKey) {
        matchedOption = option
        return true
      }
      return false
    })
  })
  return matchedOption
}

function getDefaultOptionKey(sections) {
  const firstSection = (sections || [])[0]
  const firstOption = firstSection && firstSection.items ? firstSection.items[0] : null
  return firstOption ? firstOption.optionKey : ''
}

Page({
  data: {
    serviceId: '',
    gameId: '',
    serviceName: '',
    serviceTitle: '',
    title: '',
    image: '',
    status: 'available',
    isAvailable: true,
    hasSections: false,
    showComingSoonCard: false,
    sections: [],
    appendix: null,
    selectedOptionKey: '',
    selectedOptionSummary: '',
    showActionSummary: false,
    
    // SKU Modal States
    showOrderModal: false,
    currentPrice: 0,
    currentUnit: '次',
    currentTier: '',
    buyQuantity: 1,
    enableAddon: false,
    hasAddonOption: false,
    addonLabel: '',
    addonPrice: 0,
    totalAmount: 0,
    isCustomOrder: false,  // 是否为自定义订单
    customAmount: '',  // 自定义金额
  },
  onLoad(options) {
    const serviceId = options.serviceId || 'peiwan'
    const gameId = options.gameId || ''
    const detail = getServiceDetail(serviceId, gameId)
    const game = detail.game || {}
    const baseSections = prepareSections(game.sections || [])
    const selectedOptionKey = game.status === 'available' ? getDefaultOptionKey(baseSections) : ''
    const sections = applySelectionToSections(baseSections, selectedOptionKey)
    const defaultOption = findOptionByKey(sections, selectedOptionKey)
    const isAvailable = game.status === 'available'
    const appendix = prepareAppendix(detail.appendix || null)

    this.setData({
      serviceId: detail.serviceId,
      gameId: game.gameId || gameId,
      serviceName: detail.serviceName,
      serviceTitle: detail.serviceTitle,
      title: game.gameName || '',
      image: game.imageKey ? app.getGameImageUrl(game.imageKey) : '',
      status: game.status || 'available',
      isAvailable,
      hasSections: sections.length > 0,
      showComingSoonCard: !sections.length && game.status === 'comingSoon',
      sections,
      appendix,
      selectedOptionKey,
      selectedOptionSummary: defaultOption ? defaultOption.sectionTitle + ' · ' + defaultOption.label : '',
      showActionSummary: !!defaultOption
    })
  },
  handleSelectOption(e) {
    const optionKey = e.currentTarget.dataset.optionKey
    if (!optionKey || this.data.status !== 'available') return
    const selectedOption = findOptionByKey(this.data.sections, optionKey)
    
    // 检查是否为自定义订单
    const isCustomOrder = selectedOption && (
      selectedOption.label === '自定义金额' || 
      (selectedOption.parsedPrices && selectedOption.parsedPrices.length > 0 && selectedOption.parsedPrices[0].isCustom)
    )
    
    this.setData({
      selectedOptionKey: optionKey,
      selectedOptionSummary: selectedOption ? selectedOption.sectionTitle + ' · ' + selectedOption.label : '',
      sections: applySelectionToSections(this.data.sections, optionKey),
      showActionSummary: !!selectedOption,
      isCustomOrder: isCustomOrder || false,  // 设置自定义订单标识
      customAmount: isCustomOrder ? '' : this.data.customAmount  // 重置自定义金额
    })
  },

  // SKU Logic
  calculateTotal() {
    const { currentPrice, buyQuantity, enableAddon, addonPrice, hasAddonOption } = this.data;
    const basePrice = currentPrice || 0;
    const addon = (enableAddon && hasAddonOption) ? addonPrice : 0;
    const total = (basePrice + addon) * buyQuantity;
    this.setData({ totalAmount: total.toFixed(2) });
  },
  
  closeModal() {
    this.setData({ showOrderModal: false });
  },

  switchBillingMode(e) {
    const dataset = e.currentTarget.dataset;
    const price = parseFloat(dataset.price) || 0;
    const tier = dataset.tier || '';
    const unit = dataset.unit || '次';
    const original = dataset.original || '';

    if (this.data.currentOriginal === original) return;

    this.setData({
      currentPrice: price,
      currentUnit: unit,
      currentTier: tier,
      currentOriginal: original,
      buyQuantity: 1
    });

    this.calculateTotal();
  },

  changeQuantity(e) {
    const type = e.currentTarget.dataset.type;
    let qty = this.data.buyQuantity;
    if (type === 'minus' && qty > 1) {
      qty -= 1;
    } else if (type === 'plus') {
      qty += 1;
    }
    this.setData({ buyQuantity: qty });
    this.calculateTotal();
  },

  toggleAddon(e) {
    this.setData({
      enableAddon: e.detail.value
    });
    this.calculateTotal();
  },

  confirmPay() {
    // Collect specific order specs
    const orderSpecs = {
      billingMode: '按' + this.data.currentUnit,
      quantity: this.data.buyQuantity,
      enableAddon: this.data.enableAddon,
      totalAmount: this.data.totalAmount,
      currentTier: this.data.currentTier
    }
    this.setData({ showOrderModal: false })
    this.executeOrderCreation(orderSpecs)
  },

  handleCreateOrder() {
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
    const firstSku = skuPrices[0] || { price: 0, unit: '次', tierName: '', original: '' };

    // 自定义订单特殊处理
    const isCustom = selectedOption.isCustom || (firstSku && firstSku.isCustom);

    this.setData({
      showOrderModal: true,
      skuPrices: skuPrices,
      currentPrice: isCustom ? 0 : firstSku.price,
      currentUnit: isCustom ? '自定义' : firstSku.unit,
      currentTier: isCustom ? '自定义订单' : firstSku.tierName,
      currentOriginal: firstSku.original,
      hasAddonOption: hasAddon && !isCustom,  // 自定义订单不支持附加服务
      addonLabel: addonLabel || '附加服务',
      addonPrice: parsedAddonPrice,
      buyQuantity: 1,
      enableAddon: false,
      isCustomOrder: isCustom,
      customAmount: isCustom ? '' : this.data.customAmount  // 自定义订单时清空金额
    });

    this.calculateTotal();
  },

  executeOrderCreation(orderSpecs) {
    const selectedOption = findOptionByKey(this.data.sections, this.data.selectedOptionKey)
    if (!selectedOption) return;

    const finalLabel = `${orderSpecs.currentTier} | ${orderSpecs.billingMode}x${orderSpecs.quantity}${orderSpecs.enableAddon && this.data.hasAddonOption ? ' | ' + this.data.addonLabel : ''}`

    let requiredGender = 'any';
    const checkStr = [
      this.data.serviceName,
      selectedOption.sectionTitle,
      orderSpecs.currentTier,
      finalLabel
    ].join('-');

    if (checkStr.includes('男陪')) {
      requiredGender = 'male';
    } else if (checkStr.includes('女陪')) {
      requiredGender = 'female';
    }

    // ✨ 新增：根据是否选择端游额外服务，决定使用哪个游戏ID
    let targetGameId = this.data.gameId; // 默认使用当前游戏ID（手游）
    let platformTag = '';
    
    // 如果选择了端游额外服务，使用端游ID
    if (orderSpecs.enableAddon && this.data.hasAddonOption && this.data.gameId === 'delta') {
      targetGameId = 'delta_pc'; // 端游ID
      platformTag = ' [端游]';
    }

    const order = createPendingOrder({
      serviceId: this.data.serviceId,
      serviceName: this.data.serviceName,
      gameId: targetGameId, // ✨ 使用根据平台选择的游戏ID
      gameName: this.data.title + platformTag, // ✨ 在标题后加上平台标识
      sectionTitle: selectedOption.sectionTitle,
      optionLabel: finalLabel,
      priceLines: selectedOption.prices,
      extra: selectedOption.extra,
      totalAmount: orderSpecs.totalAmount,
      requiredGender: requiredGender
    })

    wx.showModal({
      title: '支付确认',
      content: `本次订单总计 ¥${orderSpecs.totalAmount}，是否前往微信支付并生成订单？`,
      confirmText: '去支付',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          try {
            const { payOrder } = require('../../utils/order-store')
            // 将整个 order 对象传给 payOrder 进行微信支付流程
            await payOrder(order)
            setTimeout(() => {
              wx.navigateTo({ url: '/pages/orders/orders?tab=pendingAccept' }) // 跳转待接单即可
            }, 1000)
          } catch (err) {
            wx.showModal({ title: '支付失败', content: err.message, showCancel: false })
          }
        }
      }
    })
  },

  // 自定义金额输入处理
  handleCustomAmountInput(e) {
    let value = e.detail.value
    // 只允许输入整数（0-9），移除所有非数字字符
    value = value.replace(/[^\d]/g, '')
    
    // 转换为数字并限制最大值为10000
    let numValue = parseInt(value) || 0
    if (numValue > 10000) {
      numValue = 10000
      value = '10000'
    }
    
    this.setData({
      customAmount: value,
      currentPrice: numValue,
      totalAmount: numValue
    })
  },

  // 自定义金额失焦处理
  handleCustomAmountBlur(e) {
    const value = e.detail.value
    let amount = parseInt(value) || 0
    
    // 限制最大值
    if (amount > 10000) {
      amount = 10000
    }
    
    this.setData({
      customAmount: amount > 0 ? String(amount) : '',
      currentPrice: amount,
      totalAmount: amount
    })
  },

  goBack() {
    wx.navigateBack()
  }
})