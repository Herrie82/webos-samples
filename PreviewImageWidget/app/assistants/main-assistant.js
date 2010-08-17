function MainAssistant() {
    this.urls = [
            "images/100131_00001_chuq.jpg",
            "images/100304_00001_chuq.jpg",
            "images/100302_00001_chuq.jpg",
            "images/100320_00001_chuq.jpg",
        ];
    this.index = 0;
}

MainAssistant.prototype.setup = function() {
    this.imageView = this.controller.get('preview-image');
    this.imageView.style.height = Mojo.Environment.DeviceInfo.screenHeight + "px";
    this.imageView.style.width = Mojo.Environment.DeviceInfo.screenWidth + "px";

    this.controller.setupWidget(
        "preview-image",
        {}, {
            onLeftFunction: this.getLeftImage.bind(this),
            onRightFunction: this.getRightImage.bind(this)
        });
};

MainAssistant.prototype.activate = function() {
    this.imageView.mojo.centerUrlProvided(this.urls[this.index]);
    this.imageView.mojo.rightUrlProvided(this.urls[this.index+1]);
};

MainAssistant.prototype.getLeftImage = function() {
    Mojo.Log.info("getLeftImage: %j", this.index);
    if (this.index <= 0) {
        return;
    }
    this.index--;
    this.imageView.mojo.leftUrlProvided(this.urls[this.index-1]);
};

MainAssistant.prototype.getRightImage = function() {
    Mojo.Log.info("getRightImage: %j", this.index);
    if (this.index+1 >= this.urls.length) {
        return;
    }
    this.index++;
    this.imageView.mojo.rightUrlProvided(this.urls[this.index+1]);
};
