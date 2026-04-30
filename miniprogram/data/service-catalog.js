const APPENDIXES = {
  appendix1: {
    title: '下单须知',
    items: [
      '⚠️ 未成年人禁止下单！！！',
      '⚠️ 老板禁止私加商家！私加商家如被骗本俱乐部概不负责！商家私加老板，老板向客服举报可获得奖金！',
      '技术陪未达标可全额退款，不算单',
      '娱乐陪输赢均结算，主打情绪价值',
      '满20分钟按半小时计费；超时按实际时长算'
    ]
  },
  appendix2: {
    title: '下单须知',
    items: [
      '⚠️ 未成年人禁止下单！！！',
      '⚠️ 老板禁止私加商家！私加商家如被骗本俱乐部概不负责！商家私加老板，老板向客服举报可获得奖金！',
      '技术陪未达标可全额退款，不算单（1小时保底488W，没撤离一把补20分钟，没撤塞进保险里的不计入保底）',
      '娱乐陪输赢和撤离成功与否均结算',
      '满20分钟按半小时计费；超时按实际时长算'
    ]
  }
}

const SERVICE_CATALOG = {
  peiwan: {
    id: 'peiwan',
    name: '指导',
    title: '热门指导',
    intro: '指导服务覆盖聊天陪伴、新手引导、带玩上分和高段位陪练。',
    games: [
      {
        gameId: 'valorant',
        gameName: '无畏契约',
        imageKey: 'valorant',
        status: 'available',
        subtitle: '娱乐陪陪 / 技术陪陪包C / 高段大神 / 支付测试',
        appendixKey: 'appendix1',
        sections: [
          {
            title: '自定义订单',
            description: '用户可自定义支付金额',
            items: [
              { 
                label: '自定义金额', 
                prices: ['自定义金额'],
                isCustom: true
              }
            ]
          },
          {
            title: '娱乐陪陪',
            description: '聊天 / 带玩 / 新手引导',
            items: [
              { label: '男陪陪', prices: ['12元/局', '25元/小时'], extra: '可选甜蜜单 +10元/局' },
              { label: '女陪陪', prices: ['20元/局', '40元/小时'], extra: '可选甜蜜单 +10元/局' }
            ]
          },
          {
            title: '技术陪陪包C',
            description: '赢局全结，输局评分倒数前二算炸单',
            items: [
              { label: '男陪陪', prices: ['25元/局', '45元/小时'] },
              { label: '女陪陪', prices: ['30元/局', '55元/小时'] }
            ]
          },
          {
            title: '高段大神',
            description: '高段位大神',
            items: [
              { label: '超凡', prices: ['45元/局', '85元/小时'] },
              { label: '神话 / 赋能', prices: ['65元/局', '120元/小时'] }
            ]
          }
        ]
      },
      {
        gameId: 'delta',
        gameName: '三角洲行动',
        imageKey: 'delta',
        status: 'available',
        subtitle: '娱乐陪陪 / 技术陪陪',
        appendixKey: 'appendix2',
        sections: [
          {
            title: '娱乐陪陪',
            description: '聊天 / 带玩 / 新手引导',
            items: [
              { label: '男陪陪', prices: ['30元/小时'], extra: '端游 +10元' },
              { label: '女陪陪', prices: ['40元/小时'], extra: '端游 +10元' }
            ]
          },
          {
            title: '技术陪陪',
            description: '高KD / 保撤离 / 上分',
            items: [
              { label: '男陪陪', prices: ['机密航天和巴克什 50元/小时', '绝密航天和巴克什 60元/小时', '监狱 70元/小时'], extra: '端游 +10元' },
              { label: '女陪陪', prices: ['机密航天和巴克什 60元/小时', '绝密航天和巴克什 70元/小时', '监狱 80元/小时'], extra: '端游 +10元' }
            ]
          }
        ]
      }
    ]
  },
  dailian: {
    id: 'dailian',
    name: '单单',
    title: '热门单单',
    intro: '单单服务支持无畏契约小段冲分和三角洲行动跑刀。',
    games: [
      {
        gameId: 'valorant',
        gameName: '无畏契约',
        imageKey: 'valorant',
        status: 'available',
        subtitle: '单单上分（按小段）',
        appendixKey: 'appendix1',
        sections: [
          {
            title: '单单上分',
            description: '按小段计费',
            items: [
              { label: '黄金 → 铂金', prices: ['20元/小段'] },
              { label: '铂金 → 钻石', prices: ['30元/小段'] },
              { label: '钻石 → 超凡', prices: ['48元/小段'] },
              { label: '超凡 → 神话', prices: ['100元/小段'] }
            ]
          }
        ]
      },
      {
        gameId: 'delta',
        gameName: '三角洲行动',
        imageKey: 'delta',
        status: 'available',
        subtitle: '跑刀（哈夫币 / 时长）',
        appendixKey: 'appendix2',
        sections: [
          {
            title: '跑刀',
            description: '按哈夫币计费',
            items: [
              { label: '首单体验', prices: ['88元 = 688W（2-3小时）'], badge: '活动A关联' },
              { label: '9格保险箱', prices: ['50元/1000W'] },
              { label: '6格保险箱', prices: ['55元/1000W'] },
              { label: '4格保险箱', prices: ['60元/1000W'] },
              { label: '2格保险箱', prices: ['65元/1000W'] }
            ]
          },
          {
            title: '大额特惠',
            description: '按哈夫币计费',
            items: [
              { label: '3000W', prices: ['160元（9格）', '175元（6格）'] },
              { label: '5000W', prices: ['270元（9格）', '290元（6格）'] },
              { label: '1亿', prices: ['540元（9格）', '590元（6格）'] }
            ]
          },
          {
            title: '跑刀',
            description: '按时长计费',
            items: [
              { label: '包月跑刀', prices: ['1490元/月'], extra: '每日1000W' },
              { label: '10小时卡', prices: ['娱乐指导 350元（9折）', '技术指导 600元（9折）'] }
            ]
          }
        ]
      }
    ]
  }
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data))
}

function prepareSections(sections) {
  return (sections || []).map((section, sectionIndex) => ({
    title: section.title,
    description: section.description,
    items: (section.items || []).map((option, optionIndex) => {
      // 处理自定义订单
      if (option.isCustom) {
        return {
          label: option.label,
          prices: option.prices || [],
          parsedPrices: [{
            original: option.prices[0] || '自定义金额',
            tierName: option.label || '自定义订单',
            price: 0,
            unit: '自定义',
            isCustom: true
          }],
          extra: option.extra || '',
          badge: option.badge || '',
          optionKey: sectionIndex + '-' + optionIndex,
          sectionTitle: section.title,
          activeClass: '',
          isCustom: true
        };
      }
      
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
          unit: unit,
          isCustom: false
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
        activeClass: '',
        isCustom: false
      };
    })
  }))
}

function getServiceConfig(serviceId) {
  return SERVICE_CATALOG[serviceId] || SERVICE_CATALOG.peiwan
}

function getServiceTabs() {
  return Object.keys(SERVICE_CATALOG).map((serviceId) => {
    const service = SERVICE_CATALOG[serviceId]
    return {
      id: service.id,
      name: service.name,
      title: service.title,
      intro: service.intro
    }
  })
}

function getServiceDisplay(serviceId) {
  const service = getServiceConfig(serviceId)
  return {
    id: service.id,
    name: service.name,
    title: service.title,
    intro: service.intro,
    games: cloneData(service.games)
  }
}

function getServiceDetail(serviceId, gameId) {
  const service = getServiceConfig(serviceId)
  const matchedGame = service.games.find((game) => game.gameId === gameId) || service.games[0]

  return cloneData({
    serviceId: service.id,
    serviceName: service.name,
    serviceTitle: service.title,
    serviceIntro: service.intro,
    appendix: matchedGame && matchedGame.appendixKey ? APPENDIXES[matchedGame.appendixKey] : null,
    game: matchedGame
  })
}

module.exports = {
  getServiceTabs,
  getServiceDisplay,
  getServiceDetail
}