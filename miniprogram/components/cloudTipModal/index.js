Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ''
    },
    message: {
      type: String,
      value: ''
    },
    confirmText: {
      type: String,
      value: '确定'
    },
    cancelText: {
      type: String,
      value: '取消'
    }
  },
  methods: {
    handleMaskTap: function () {
      this.triggerEvent('masktap')
    },
    handleCancel: function () {
      this.triggerEvent('cancel')
    },
    handleConfirm: function () {
      this.triggerEvent('confirm')
    }
  }
})